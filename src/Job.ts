import Path                              from "path"
import crypto                            from "crypto"
import {existsSync, statSync }           from "fs"
import { format }                        from "node:util"
import config                            from "./config"
import { lock, wait }                    from "./lib"
import { InternalServerError, NotFound } from "./HttpError"
import { matchAll }                      from "./match"
import patients                          from "./patients"
import type app                          from "../index"
import {
    mkdir,
    readFile,
    rm,
    writeFile
} from "fs/promises"


export default class Job
{
    private static instances: Record<string, Job> = {}

    /**
     * Unique ID for this job
     */
    readonly id: string;

    readonly path: string;

    protected baseUrl: string = "";

    protected createdAt: number = 0;

    public completedAt: number = 0;

    protected _percentage: number = 0;

    public notBefore: number = 0;

    protected abortController: AbortController;

    public error: string = "";

    public manifest: app.MatchManifest = {
        transactionTime    : "",
        request            : "",
        requiresAccessToken: false,
        error              : [],
        output             : []
    }

    /**
     * NOTE: The constructor is protected because it is not supposed to be
     * called directly from outside this class. The reason is that one would
     * also want to save the new instance to a file and that is async task but
     * constructors cannot be async. The `create` method can be used instead.
     */
    protected constructor(_jobId?: string) {
        this.id = _jobId || crypto.randomBytes(8).toString("hex")
        this.createdAt = Date.now()
        this.path = Path.join(config.jobsDir, this.id)
        this.abortController = new AbortController()
        Job.instances[this.id] = this
    }

    static async create(baseUrl: string, authenticated = false) {
        const job = new Job()
        job.baseUrl = baseUrl
        job.updateManifest({
            request        : baseUrl + "/fhir/Patient/$bulk-match",
            transactionTime: new Date().toUTCString(),
            requiresAccessToken: !!authenticated
        })
        return await job.save()
    }

    public get percentage() {
        return this._percentage
    }

    public abort() {
        this.abortController.abort()
    }

    public async destroy() {
        this.abort()
        const release = await lock(this.path)
        await rm(this.path, { recursive: true, maxRetries: 10, force: true })
        await release()
        delete Job.instances[this.id]
        return this;
    }

    async run(params: app.MatchOperationParams, options: app.MatchOperationOptions = {}) {
        try {
            const inputPatients = params.resource.map(r => r.resource as fhir4.Patient)
        
            let i = 0
            for (const inputPatient of inputPatients) {
                if (options.matchServer) {
                    await this.matchOneViaProxy({
                        patient: inputPatient,
                        onlyCertainMatches: params.onlyCertainMatches,
                        count: params.count
                    })
                } else {
                    await wait(config.jobThrottle, { signal: this.abortController.signal })
                    await this.matchOne(inputPatient)
                }
                this._percentage = Math.floor(++i / inputPatients.length * 100)
                await this.save()
            }

            this.completedAt = Date.now()
        } catch (error) {
            this.error = (error as Error).message
        }
        await this.save()
    }

    async matchOne(input: Partial<fhir4.Patient>) {
        const result = matchAll(input, patients, this.baseUrl)
        const bundle: fhir4.Bundle = {
            resourceType: "Bundle",
            type: "searchset",
            total: result.length,
            meta: {
                extension: [{
                    url: "http://hl7.org/fhir/uv/bulkdata/OperationDefinition/match-resource",
                    valueReference: {
                        reference: `Patient/${input.id}`
                    }
                }]
            },                  
            entry: result
        };
        if (!this.abortController.signal.aborted && !existsSync(this.path + "/files")) {
            await mkdir(this.path + "/files")
        }
        await writeFile(
            Path.join(this.path, "/files/" + input.id + `-patient-matches.ndjson`),
            JSON.stringify(bundle) + "\n",
            { flag: "w+", encoding: "utf8", signal: this.abortController.signal }
        );
        this.updateManifest({
            output: [
                ...this.manifest.output,
                {
                    type : "Bundle",
                    count: result.length,
                    url  : this.baseUrl + "/jobs/" + this.id + "/files/" + input.id + `-patient-matches.ndjson`
                }
            ]
        })
    }

    async matchOneViaProxy({ patient, onlyCertainMatches, count }: {
        patient: Partial<fhir4.Patient>
        onlyCertainMatches: boolean
        count: number
    }) {
        const body: fhir4.Parameters = {
            resourceType: "Parameters",
            id: "example",
            parameter: [
                {
                    name: "resource",
                    resource: patient as fhir4.Patient
                },
                {
                    name: "onlyCertainMatches",
                    valueBoolean: onlyCertainMatches
                }
            ]
        }

        if (count) {
            body.parameter?.push({
                name: "count",
                valueInteger: count
            })
        }

        const res = await fetch("http://hapi.fhir.org/baseR4/Patient/$match", {
            method : "POST",
            body: JSON.stringify(body),
            signal: this.abortController.signal,
            headers: {
                "Content-Type": "application/json",
                // accept: "application/fhir+ndjson"
            }
        })

        const json = await res.json()

        // console.log("Matching ", input.id)
        console.log(json)
    }

    public updateManifest(data: Partial<app.MatchManifest>) {
        Object.assign(this.manifest, data)
    }

    public toJSON() {
        return {
            id            : this.id,
            createdAt     : this.createdAt,
            completedAt   : this.completedAt,
            _percentage   : this._percentage,
            manifest      : this.manifest,
            notBefore     : this.notBefore,
            error         : this.error,
            // parameters    : this.parameters,
            // authorizations: this.authorizations,
        }
    }

    public async save() {
        if (!this.abortController.signal.aborted) {
            const release = await lock(this.path)
            if (!existsSync(this.path)) {
                await mkdir(this.path)
            }

            const json = JSON.stringify(this.toJSON(), null, 4)

            await writeFile(
                Path.join(this.path, `job.json`),
                json,
                { flag: "w+", encoding: "utf8", signal: this.abortController.signal }
            );
            await release()
        }
        return this;
    }

    public static async destroyIfNeeded(id: string) {
        const job = await Job.byId(id)
        if (job.percentage === 100) {
            if (Date.now() - job.completedAt > config.completedJobLifetimeMinutes * 60_000) {
                await job.destroy()
            }
        }
        else if (Date.now() - job.createdAt > config.jobMaxLifetimeMinutes * 60_000) {
            await job.destroy()
        }
    }

    public static async byId(id: string) {
        const job = Job.instances[id] || new Job(id)

        const path = Path.join(config.jobsDir, id, "job.json")

        if (!statSync(path, { throwIfNoEntry: false })?.isFile()) {
            throw new NotFound("Job not found")
        }

        const release = await lock(Path.join(config.jobsDir, id))
        
        try {
            var data = await readFile(path, { flag: "r+", encoding: "utf8" })
        } catch {
            await release()
            throw new InternalServerError("Job not readable")
        }
        
        try {
            var json = JSON.parse(data)
        } catch (e) {
            await release()
            throw new InternalServerError("Job corrupted", {
                reason: format("Cannot parse data from %s as JSON: %s; input: %j", path, e, data),
                cause: e
            })
        }
        
        try {
            Object.assign(job, json)
        } catch (e) {
            await release()
            throw new InternalServerError("Export job could not be loaded", { cause: e })
        }
        
        await release()
        
        return job
    }
}


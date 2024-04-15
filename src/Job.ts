import Path                              from "path"
import crypto                            from "crypto"
import {existsSync, statSync }           from "fs"
import { format }                        from "node:util"
import { FhirResource, Patient }         from "fhir/r4"
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


interface JobOptions {

    /**
     * If true, set the `requiresAccessToken` property of the manifest to true
     * and require auth for downloading
     */
    authenticated: boolean

    /**
     * Percents if the input patients that should be reported as matched.
     * If this is `0` (the default value), it will be ignored and we will try
     * to do actual matching instead
     */
    percentFakeMatches: number

    percentFakeDuplicates: number

    simulatedError: string
}

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

    protected options: JobOptions = {
        authenticated: false,
        percentFakeMatches: 0,
        percentFakeDuplicates: 0,
        simulatedError: ""
    };

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

    static async create(baseUrl: string, options: Partial<JobOptions> = {}) {
        const job = new Job()
        job.baseUrl = baseUrl
        Object.assign(job.options, options)

        job.updateManifest({
            request        : baseUrl + "/fhir/Patient/$bulk-match",
            transactionTime: new Date().toUTCString(),
            requiresAccessToken: job.options.authenticated
        })

        if (options.percentFakeMatches || options.percentFakeDuplicates) {
            job.updateManifest({
                extension: {
                    percentFakeMatches   : options.percentFakeMatches    || undefined,
                    percentFakeDuplicates: options.percentFakeDuplicates || undefined
                }
            })
        }

        return await job.save("initial save")
    }

    public get percentage() {
        return this._percentage
    }

    public abort() {
        this.abortController.abort()
    }

    public async destroy() {
        this.abort()
        const release = await Job.lock(this.id)
        await rm(this.path, { recursive: true, maxRetries: 10, force: true })
        await release()
        delete Job.instances[this.id]
        return this;
    }

    async fakeRun(params: app.MatchOperationParams)
    {
        const resources = params.resource
        const n = Math.floor(resources.length / 100 * this.options.percentFakeMatches)

        if (n < 1) {
            this.updateManifest({ output: [] })
            this._percentage = 100
            return await this.save("Save on no match")
        }

        const results = resources
            .map(r => r.resource as Patient)
            .sort((a, b) => a!.id!.localeCompare(b!.id!))
            .slice(0, n)
        let i = 0

        while (i < n) {
            const release = await Job.lock(this.id)
            const result = results[i]
            const bundle: fhir4.Bundle = {
                resourceType: "Bundle",
                type : "searchset",
                total: results.length,
                meta: {
                    extension: [{
                        url: "http://hl7.org/fhir/uv/bulkdata/OperationDefinition/match-resource",
                        valueReference: {
                            reference: `Patient/${result.id}`
                        }
                    }]
                },
                entry: [
                    {
                        fullUrl: `Patient/${result.id}`,
                        resource: result as FhirResource,
                        search: {
                            extension: [{
                                url: "http://hl7.org/fhir/StructureDefinition/match-grade",
                                valueCode: "certain"
                            }],
                            mode : "match",
                            score: 1
                        }
                    }
                ]
            };
            
            if (!this.abortController.signal.aborted && !existsSync(this.path + "/files")) {
                await mkdir(this.path + "/files")
            }
            await writeFile(
                Path.join(this.path, "/files/" + result.id + `-patient-matches.ndjson`),
                JSON.stringify(bundle) + "\n",
                { flag: "w+", encoding: "utf8", signal: this.abortController.signal }
            );
            this.updateManifest({
                output: [
                    ...this.manifest.output,
                    {
                        type : "Bundle",
                        count: 1,
                        url  : this.baseUrl + "/jobs/" + this.id + "/files/" + result.id + `-patient-matches.ndjson`
                    }
                ]
            })
            this._percentage = Math.round(i / n * 100)
            await this.save("save " + i, true)
            i++
            await release()
            await wait(config.jobThrottle, { signal: this.abortController.signal })
        }
        this._percentage = 100
        await this.save("completed fakeRun")
    }

    async run(params: app.MatchOperationParams, options: app.MatchOperationOptions = {}) {
        if (this.options.percentFakeMatches) {
            return this.fakeRun(params)
        }
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
                await this.save("completed match " + i)
            }

            this.completedAt = Date.now()
        } catch (error) {
            this.error = (error as Error).message
        }
        await this.save("completed run")
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
            options       : this.options,
            // parameters    : this.parameters,
            // authorizations: this.authorizations,
        }
    }

    public async save(label = "", skipLock = false) {
        // console.log("======== SAVE ========", label)
        if (!this.abortController.signal.aborted) {
            let release
            if (!skipLock) {
                release = await lock(this.path)
            }
            if (!existsSync(this.path)) {
                await mkdir(this.path)
            }

            const json = JSON.stringify(this.toJSON(), null, 4)

            await writeFile(
                Path.join(this.path, `job.json`),
                json,
                { flag: "w+", encoding: "utf8", signal: this.abortController.signal }
            );
            if (release) {
                await release()
            }
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

        const release = await Job.lock(id)
        
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

    static async lock(id: string) {
        return await lock(Path.join(config.jobsDir, id))
    }
}


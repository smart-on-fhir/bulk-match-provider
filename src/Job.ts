import Path                                   from "path"
import crypto                                 from "crypto"
import {existsSync, statSync }                from "fs"
import { format }                             from "node:util"
import { Patient }                            from "fhir/r4"
import { faker }                              from "@faker-js/faker"
import config                                 from "./config"
import { createOperationOutcome, lock, wait } from "./lib"
import { InternalServerError, NotFound }      from "./HttpError"
import { matchAll }                           from "./match"
import patients                               from "./patients"
import type app                               from "../index"
import { InputPatient }                       from "../index"
import {
    appendFile,
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

    matchServer: string
        
    matchHeaders: [string, string][]
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

    protected matchServer: string = "";

    protected destroyed = false;

    private currentFilename = faker.string.uuid() + ".ndjson"
    
    private bundleCounter = 0

    private matchResultPatientCount = 0

    private matchResultOperationOutcomeCount = 0

    protected options: JobOptions = {
        authenticated: false,
        percentFakeMatches: 0,
        percentFakeDuplicates: 0,
        simulatedError: "",
        matchServer: "",
        matchHeaders: []
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

    static countRunningJobs() {
        return Object.keys(Job.instances).filter(id => Job.instances[id].percentage < 100).length;
    }

    static canCreate() {
        return Job.countRunningJobs() < config.maxRunningJobs;
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

    public get successScore() {
        const total = this.matchResultPatientCount + this.matchResultOperationOutcomeCount
        const score = (this.matchResultPatientCount || 1) / (total || 1)
        return score
    }

    public abort() {
        this.abortController.abort()
    }

    public async destroy() {
        this.abort()
        const release = await Job.lock(this.id)
        await rm(this.path, { recursive: true, maxRetries: 10, force: true })
        this.destroyed = true
        await release()
        delete Job.instances[this.id]
        return this;
    }

    /* If the limit is up to 3 bundles per file:
     * 
     * FILE 1
     *     BUNDLE
     *         Patient 1 - result 1
     *         Patient 1 - result 2
     *     BUNDLE
     *         Patient 2 - result 1
     *         Patient 2 - result 2
     *         Patient 2 - result 3
     *     BUNDLE
     *         Patient 3 - OperationOutcome
     * FILE 2
     *     BUNDLE
     *         Patient 4 - empty result
     *     BUNDLE
     *         Patient 5 - OperationOutcome
     *     BUNDLE
     *         Patient 6 - result 1
     *         Patient 6 - result 1
     */

    private async saveBundle(bundle: fhir4.Bundle) {
        if (!this.abortController.signal.aborted && !this.destroyed) {
            if (!existsSync(this.path + "/files")) {
                await mkdir(this.path + "/files", { recursive: true })
            }
            await appendFile(
                Path.join(this.path, "/files/" + this.currentFilename),
                JSON.stringify(bundle) + "\n",
                "utf8"
            );
            this.bundleCounter++
        }
    }

    private commitFile() {
        this.updateManifest({
            output: [
                ...this.manifest.output,
                {
                    type : "Bundle",
                    count: this.bundleCounter,
                    url  : this.baseUrl + "/jobs/" + this.id + "/files/" + this.currentFilename
                }
            ]
        })
        this.currentFilename = faker.string.uuid() + ".ndjson"
        this.bundleCounter   = 0
    }

    private async matchOneInputPatient(
        patient: InputPatient,
        params : app.MatchOperationParams,
        index  : number,
        all    : InputPatient[]
    ): Promise<fhir4.Bundle> {
        
        // Start with an empty bundle
        const bundle = this.createBundleForInputPatient(patient)

        const count = params.count || config.maxMatches

        // Fake mode -----------------------------------------------------------
        if (this.options.percentFakeMatches) {
            const results = params.resource.map(r => r.resource as Patient).sort((a, b) => a!.id!.localeCompare(b!.id!))

            const total           = results.length
            const nFakeMatches    = Math.floor(total / 100 * this.options.percentFakeMatches)
            const nFakeDuplicates = Math.floor(nFakeMatches / 100 * this.options.percentFakeDuplicates)
            const shouldMatch     = params.onlySingleMatch && index === 0 || index < nFakeMatches
            const shouldDuplicate = nFakeDuplicates > 0 && index <= nFakeDuplicates
            // console.log(index, nFakeMatches, nFakeDuplicates, total, shouldMatch, shouldDuplicate)
            const entries         = await this.matchOneInputPatientFake(patient, shouldMatch, shouldDuplicate)
            bundle.entry          = count && isFinite(count) ? entries.slice(0, count) : entries
            bundle.total          = bundle.entry.length
        }

        // Remote mode ---------------------------------------------------------
        else if (this.options.matchServer) {
            const entries = await this.matchOneInputPatientRemote(patient, params)
            bundle.entry  = entries
            bundle.total  = entries.length
        }

        // Normal mode ---------------------------------------------------------
        else {
            const entries = matchAll(patient, {
                dataSet           : patients,
                baseUrl           : this.baseUrl,
                limit             : count,
                onlySingleMatch   : params.onlySingleMatch,
                onlyCertainMatches: params.onlyCertainMatches
            })
            
            bundle.entry  = entries || []
            bundle.total  = bundle.entry.length
        }

        // Append ene simulated match error if needed
        if (this.options.simulatedError === "match_error") {
            bundle.total = bundle.entry.push({
                resource: createOperationOutcome("Match failed (simulated error)", {
                    severity: "error"
                })
            })
        }

        // Count the number of successful matches and the OperationOutcomes
        bundle.entry.forEach(e => {
            if (e.resource?.resourceType === "Patient") {
                this.matchResultPatientCount++
            } else if (e.resource?.resourceType === "OperationOutcome") {
                this.matchResultOperationOutcomeCount++
            }
        })

        // Append bundle to the current output file
        await this.saveBundle(bundle)

        // If the result number exceeds the maxResultsPerBundle threshold of it this is the last result
        if (this.bundleCounter >= config.maxResultsPerBundle || index >= all.length - 1) {
            this.commitFile()
        }

        return bundle
    }

    private async matchOneInputPatientFake(patient: InputPatient, shouldMatch: boolean, shouldDuplicate: boolean): Promise<fhir4.BundleEntry<fhir4.FhirResource>[]> {
        const out: fhir4.BundleEntry<fhir4.FhirResource>[] = []

        if (shouldMatch) {
            out.push({
                fullUrl: `Patient/${patient.id}`,
                resource: patient,
                search: {
                    extension: [{
                        url: "http://hl7.org/fhir/StructureDefinition/match-grade",
                        valueCode: "certain"
                    }],
                    mode : "match",
                    score: 1
                }
            })
        }

        if (shouldDuplicate) {
            out.push({
                fullUrl: `Patient/${patient.id}`,
                resource: { ...patient, name: [{ ...patient.name![0], family: patient.name![0].family + " (duplicate)" }] },
                search: {
                    extension: [{
                        url: "http://hl7.org/fhir/StructureDefinition/match-grade",
                        valueCode: "certain"
                    }],
                    mode : "match",
                    score: 1
                }
            })
        }
        return out
    }

    private async matchOneInputPatientRemote(patient: InputPatient, params: app.MatchOperationParams): Promise<fhir4.BundleEntry<fhir4.FhirResource>[]> {
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
                    valueBoolean: params.onlyCertainMatches
                }
            ]
        }

        if (params.count) {
            body.parameter?.push({
                name: "count",
                valueInteger: params.count
            })
        }

        const url = new URL("Patient/$match", this.options.matchServer)

        const res = await fetch(url, {
            method : "POST",
            body: JSON.stringify(body),
            signal: this.abortController.signal,
            headers: [
                ["Content-Type", "application/json"],
                ["accept", "application/fhir+json"],
                ...this.options.matchHeaders
            ]
        })

        const json = await res.json()

        if (json.resourceType !== "Bundle") {
            throw new Error('The remote server did not reply with a Bundle')
        }

        return json.entry
    }
    
    private createBundleForInputPatient(patient: InputPatient): fhir4.Bundle {
        return {
            resourceType: "Bundle",
            type : "searchset",
            total: 0,
            meta : {
                extension: [{
                    url: "http://hl7.org/fhir/uv/bulkdata/OperationDefinition/match-resource",
                    valueReference: {
                        reference: `Patient/${patient.id}`
                    }
                }]
            },
            entry: []
        }
    }

    async run(params: app.MatchOperationParams) {
        const inputPatients = params.resource.map(r => r.resource as InputPatient)
        let i = 0
        for (const inputPatient of inputPatients) {
            const release = await Job.lock(this.id)
            try {
                await wait(config.jobThrottle, { signal: this.abortController.signal })
                await this.matchOneInputPatient(inputPatient, params, i, inputPatients)
            } catch (ex) {
                this.error = (ex as Error).message
            } finally {
                this._percentage = Math.floor(++i / inputPatients.length * 100)
                await this.save("completed match " + i, true)
                await release()
                await wait(100, { signal: this.abortController.signal })
            }
        }
        this.completedAt = Date.now()
        await this.save("completed run")
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
        if (!this.abortController.signal.aborted && !this.destroyed) {
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
            /* istanbul ignore next */
            await release()
            /* istanbul ignore next */
            throw new InternalServerError("Job not readable")
        }
        
        try {
            var json = JSON.parse(data)
            if(!json || typeof json !== "object") {
                throw new Error("invalid type of data stored in the job file")
            }
        } catch (e) {
            await release()
            throw new InternalServerError("Job corrupted", {
                reason: format("Cannot parse data from %s as JSON: %s; input: %j", path, e, data),
                cause: e
            })
        }

        Object.assign(job, json)
        await release()
        return job
    }

    static async lock(id: string) {
        return await lock(Path.join(config.jobsDir, id))
    }
}


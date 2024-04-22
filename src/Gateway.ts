import Path                                                from "path"
import type { Request, Response }                          from "express"
import { statSync }                                        from "fs"
import { readdir }                                         from "fs/promises"
import { IncomingHttpHeaders }                             from "http"
import config                                              from "./config"
import Job                                                 from "./Job"
import { createOperationOutcome, getRequestBaseURL, uInt } from "./lib"
import type app                                            from "../index"
import {
    BadRequest,
    NotFound,
    PayloadTooLarge,
    TooManyRequests,
    Unauthorized
} from "./HttpError"


export async function abort(req: Request, res: Response) {
    const job = await Job.byId(req.params.id)
    await job.destroy()
    res.status(202).json(
        createOperationOutcome("Job deleted", { severity: "information" })
    )
}

export async function getJob(req: Request, res: Response) {
    const job = await Job.byId(req.params.id)
    res.json(job)
}

export async function listJobs(req: Request, res: Response) {
    const result = []
    for (const id of await readdir(config.jobsDir)) {
        if (statSync(Path.join(config.jobsDir, id)).isDirectory()) {
            result.push((await Job.byId(id)).toJSON())
        }
    }
    res.json(result)
}

export async function checkStatus(req: app.Request, res: Response) {
    if (req.registeredClient?.err === "too_frequent_status_requests") {
        throw new TooManyRequests("Too frequent status requests (simulated error)")
    }

    try {
        var job = await Job.byId(req.params.id)
    } catch (ex) {
        return res.status(404).json(createOperationOutcome(ex))
    }

    if (job.error) {
        return res.status(500).json(createOperationOutcome(job.error,  { severity: "error" }))
    }

    if (job.percentage === 100) {
        return res.setHeader(
            "Expires",
            new Date(job.completedAt + config.completedJobLifetimeMinutes * 60_000).toUTCString()
        ).json(job.manifest)
    }

    const release = await Job.lock(job.id)

    res.header("Access-Control-Expose-Headers", "X-Progress,Retry-after")

    const now = Date.now()

    // Our server is pretty fast. It is safe to assume that in 2 seconds the job
    // will either be complete, or will at least have made some progress
    const RETRY_AFTER = config.retryAfter

    // If this is not the first status check
    if (job.notBefore) {
        const diff = now - job.notBefore

        // If the client tries too early
        if (diff < 0) {
            job.notBefore = now + Math.abs(diff) + RETRY_AFTER
            const retryAfter = Math.ceil((job.notBefore - now) / 1000)
            
            // If excessively frequent status queries persist, the server MAY
            // return a 429 Too Many Requests status code and terminate the session.
            if (retryAfter > (RETRY_AFTER / 1000) * 10) {
                await release()
                await job.destroy()
                return res.status(429).json(createOperationOutcome(
                    "Too many requests made ignoring the retry-after header hint. Session terminated!",
                    { severity: "fatal" }
                ))
            }

            await job.save("updated notBefore", true)
            await release()
            res.header("Retry-after", retryAfter + "")
            return res.status(429).json(createOperationOutcome(
                "Too many requests made. Please respect the retry-after header!",
                { severity: "warning" }
            ))
        }
    }

    job.notBefore = now + RETRY_AFTER
    await job.save("updated notBefore", true)
    res.header("X-Progress" , job.percentage + "% complete")
    res.header("Retry-after", Math.ceil(RETRY_AFTER / 1000) + "")
    res.status(202).end()
    await release()
}

export async function downloadFile(req: app.Request, res: Response) {
    
    if (req.registeredClient?.err === "file_not_found") {
        throw new NotFound("File not found (simulated error)")
    }

    try {
        var job = await Job.byId(req.params.id)
    } catch (ex) {
        return res.status(404).json(createOperationOutcome("Export job not found"))
    }

    // If the requiresAccessToken field in the Complete Status body is set to
    // true, the request SHALL include a valid access token
    if (job.manifest.requiresAccessToken && !req.registeredClient) {
        throw new Unauthorized("Authentication is required for downloading these resources")
    }

    const path = Path.join(job.path, "files", req.params.file)

    if (!statSync(path, { throwIfNoEntry: false })?.isFile()) {
        return res.status(404).json(createOperationOutcome("File not found"))
    }

    res.sendFile(path, {
        headers: {
            "content-type"       : "application/fhir+ndjson",
            "content-disposition": "attachment",
            "connection"         : "close"
        }
    })
}

export async function kickOff(req: app.Request, res: Response) {
    
    if (req.registeredClient?.err === "too_many_patient_params") {
        throw new BadRequest("Too many patient parameters (simulated error)")
    }

    validateMatchHeaders(req.headers)
    const params = getMatchParameters(req.body as fhir4.Parameters)
    const baseUrl = getRequestBaseURL(req);
    const job = await Job.create(baseUrl, {
        authenticated        : !!req.registeredClient,
        percentFakeDuplicates: req.registeredClient?.duplicates  ?? 0,
        percentFakeMatches   : req.registeredClient?.fakeMatches ?? 0,
        simulatedError       : req.registeredClient?.err         ?? "",
        matchServer          : req.registeredClient?.matchServer ?? "",
        matchToken           : req.registeredClient?.matchToken  ?? "",
    })

    // Don't wait for this (just start it here), but also don't crash the server
    // if it fails!
    job.run(params).catch(console.error)

    const statusUrl = `${baseUrl}/jobs/${job.id}/status`
    res.header("Content-Location", statusUrl)
    res.header("Access-Control-Expose-Headers", "Content-Location")
    res.status(202).json(
        createOperationOutcome(
            `Job started and can be tracked at ${statusUrl}`,
            { severity: "information" }
        )
    )
}

function validateMatchHeaders(headers: IncomingHttpHeaders) {

    // console.log(headers)
    
    // Specifies the format of the optional FHIR OperationOutcome resource
    // response to the kick-off request. Currently, only application/fhir+json
    // is supported. A client SHOULD provide this header. If omitted, the server
    // MAY return an error or MAY process the request as if application/fhir+json
    // was supplied.
    if (headers.accept && headers.accept !== "application/fhir+ndjson") {
        throw new BadRequest(
            `If used, the accept header must be 'application/fhir+ndjson'`
        )
    }

    // Specifies whether the response is immediate or asynchronous. Currently,
    // only a value of respond-async is supported. A client SHOULD provide this
    // header. If omitted, the server MAY return an error or MAY process the
    // request as if respond-async was supplied.
    if (headers.prefer && headers.prefer !== "respond-async") {
        throw new BadRequest(
            `If used, the prefer header must be 'respond-async'`
        )
    }
}

function getMatchParameters(body: fhir4.Parameters): app.MatchOperationParams {
    const { parameter, resourceType } = body

    // Verify that we have a Parameters resource with parameter array
    if (resourceType !== "Parameters" || !parameter || !Array.isArray(parameter)) {
        throw new BadRequest("Invalid Parameters resource")
    }

    // Get all resource parameters
    const resourceParams = parameter.filter(p => p.name === "resource")

    // Must have at least one resource parameter
    if (!resourceParams.length) {
        throw new BadRequest("At least one resource parameter must be provided")
    }

    // Can't have too many resource parameters
    if (resourceParams.length > config.resourceParameterLimit) {
        throw new PayloadTooLarge(
            `Cannot use more than ${config.resourceParameterLimit} resource ` +
            `parameters. Please use multiple $bulk-match calls to match more resources`
        )
    }

    // Some validation for every resource parameter
    resourceParams.forEach((r, i) => {
        if (r.resource?.resourceType !== "Patient") {
            throw new BadRequest(`resource[${i}] does not appear to be a Patient resource`)
        }

        if (!r.resource?.id) {
            throw new BadRequest(`resource[${i}] is required to have an "id" attribute`)
        }
    })

    const onlySingleMatch = parameter.find(p => p.name === "onlySingleMatch")?.valueBoolean

    // Verify that onlySingleMatch is a boolean
    if (onlySingleMatch !== undefined && onlySingleMatch !== true && onlySingleMatch !== false) {
        throw new BadRequest(`Only boolean values are accepted for the onlySingleMatch parameter`)
    }

    const onlyCertainMatches = parameter.find(p => p.name === "onlyCertainMatches")?.valueBoolean

    // Verify that onlyCertainMatches is a boolean
    if (onlyCertainMatches !== undefined && onlyCertainMatches !== true && onlyCertainMatches !== false) {
        throw new BadRequest(`Only boolean values are accepted for the onlyCertainMatches parameter`)
    }

    const count = parameter.find(p => p.name === "count")?.valueInteger

    // Verify that count is a valid number
    if (count !== undefined && (isNaN(count) || !isFinite(count) || count < 1)) {
        throw new BadRequest(`Only integers grater than 0 are accepted for the count parameter`)
    }

    const _outputFormat = parameter.find(p => p.name === "_outputFormat")?.valueString
    
    // Verify that _outputFormat is valid
    if (_outputFormat !== undefined && !["application/fhir+ndjson", "application/ndjson", "ndjson"].includes(_outputFormat)) {
        throw new BadRequest(`If used, the _outputFormat parameter must be one of 'application/fhir+ndjson', 'application/ndjson' or 'ndjson'`)
    }

    return {
        resource          : resourceParams,
        onlySingleMatch   : onlySingleMatch || false,
        onlyCertainMatches: onlyCertainMatches || false,
        count             : uInt(count),
        _outputFormat     : _outputFormat || "application/fhir+ndjson"
    }
}

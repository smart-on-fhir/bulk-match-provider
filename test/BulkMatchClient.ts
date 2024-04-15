import jwt               from "jsonwebtoken"
import { MatchManifest } from ".."
import { wait }          from "../src/lib"
import config            from "../src/config"


interface BulkMatchRegistrationOptions {
    jwks?: { keys: any[] }
    jwks_url?: string
    fakeMatches?: number
    err?: string
}

interface BulkMatchClientOptions {
    baseUrl     : string
    tokenUrl   ?: string
    accessToken?: string
    registrationOptions?: BulkMatchRegistrationOptions
}

export default class BulkMatchClient
{
    readonly options: BulkMatchClientOptions;

    private _statusLocation: string = "";

    private _jobID: string = "";

    private _manifest: MatchManifest | null = null;

    constructor(options: BulkMatchClientOptions)
    {
        this.options = options
    }

    get statusLocation() {
        if (!this._statusLocation) {
            throw new Error("The client has not received a status location yet")
        }
        return this._statusLocation
    }

    get jobId() {
        if (!this._jobID) {
            throw new Error("The client has not received a job ID yet")
        }
        return this._jobID
    }

    get manifest() {
        if (!this._manifest) {
            throw new Error("The client has not received a manifest yet")
        }
        return this._manifest
    }

    private async request(url: string | URL, options: RequestInit = {}) {
        if (this.options.accessToken) {
            Object.assign(options, { headers: {
                ...options.headers,
                authorization: `Bearer ${this.options.accessToken}`
            }})
        }
        return fetch(url, options)
    }

    static register(claims: BulkMatchRegistrationOptions = {})
    {
        return jwt.sign(claims, config.jwtSecret)
    }

    async requestAccessToken(token: string, scope = "system/Patient.rs") {
        return fetch(`${this.options.baseUrl}/auth/token`, {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                grant_type           : "client_credentials",
                client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                client_assertion     : token,
                scope
            })
        })
    }

    async kickOff({
        resource,
        onlyCertainMatches,
        onlySingleMatch,
        _outputFormat,
        count,
        headers
    }: {
        resource?: (fhir4.Patient | any)[]
        onlyCertainMatches?: any
        onlySingleMatch?: any
        count?: any
        _outputFormat?: any,
        headers?: HeadersInit
    } = {})
    {
        const url = `${this.options.baseUrl}/fhir/Patient/$bulk-match`

        const body: fhir4.Parameters = {
            resourceType: "Parameters",
            id: "example",
            parameter: []
        }
    
        if (resource) {
            resource.forEach(r => body.parameter!.push({ name: "resource", resource: r }))
        }
    
        if (onlyCertainMatches !== undefined) {
            body.parameter!.push({ name: "onlyCertainMatches", valueBoolean: onlyCertainMatches })
        }
    
        if (onlySingleMatch !== undefined) {
            body.parameter!.push({ name: "onlySingleMatch", valueBoolean: onlySingleMatch })
        }
    
        if (count !== undefined) {
            body.parameter!.push({ name: "count", valueInteger: count })
        }
    
        if (_outputFormat !== undefined) {
            body.parameter!.push({ name: "_outputFormat", valueString: _outputFormat })
        }

        // console.log(JSON.stringify(body))
        const cfg = {
            method: "POST",
            body: JSON.stringify(body),
            headers: {
                "Content-Type": "application/json",
                accept        : "application/fhir+ndjson",
                prefer        : "respond-async",
                // authorization: `Bearer ${json.access_token}`,
                ...headers
            }
        }
        const res = await this.request(url, cfg)

        if (res.status === 202) {
            const contentLocation = res.headers.get("content-location")
            if (!contentLocation) {
                throw new Error("Invalid $bulk-match response. The server replied with 202 status code but did not include a content-location header")
            }
            this._statusLocation = contentLocation
            const jobID = contentLocation.match(/\/jobs\/(.+?)\/status$/)?.[1]
            if (!jobID) {
                throw new Error("Unable to detect jobID from the content-location header")
            }
            this._jobID = jobID
        }

        return res
        // const json = await res.json()
    }

    async waitForCompletion()
    {
        let res: Response;
        do {
            res = await this.request(this.statusLocation)
            if (res.status === 200) {
                this._manifest = await res.json()
                return this._manifest
            }
            else if (res.status === 202) {
                // console.log({
                //     "x-progress" : res.headers.get("x-progress"),
                //     "retry-after": res.headers.get("retry-after"),
                //     loc: this.statusLocation
                // })
                await wait(Math.max(+res.headers.get("retry-after")! * 1000, 100))
            }
            else {
                return await res.json() // OperationOutcome
            }
        } while (true);
    }

    async download(index?: number)
    {
        if (!index && index !== 0) {
            return Promise.all(this.manifest.output.map(x => fetch(x.url).then(r => r.json())))
        }

        const fileResponse = await fetch(this.manifest.output[index].url)
        return await fileResponse.json()
    }

    async cancel()
    {
        return this.request(this.statusLocation, { method: "DELETE" })
    }
}

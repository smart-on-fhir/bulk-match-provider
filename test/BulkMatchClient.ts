import { randomBytes }      from "crypto"
import jwt                  from "jsonwebtoken"
import jwkToPem             from "jwk-to-pem"
import { OperationOutcome } from "fhir/r4"
import { MatchManifest }    from ".."
import { wait }             from "../src/lib"
import config               from "../src/config"


interface BulkMatchRegistrationOptions {
    jwks       ?: { keys: any[] }
    jwks_url   ?: string
    fakeMatches?: number
    duplicates ?: number
    err        ?: string
    matchServer?: string
    matchToken ?: string
}

interface BulkMatchClientOptions {
    baseUrl     : string
    tokenUrl   ?: string
    clientId   ?: string
    accessToken?: string
    privateKey ?: any
    registrationOptions?: BulkMatchRegistrationOptions
}

export default class BulkMatchClient
{
    readonly options: BulkMatchClientOptions;

    private _statusLocation: string = "";

    private _jobID: string = "";

    private _manifest: MatchManifest | null = null;

    private _clientId: string = "";

    private _registrationToken: string = "";

    constructor(options: BulkMatchClientOptions)
    {
        this.options = options
        if (options.registrationOptions && options.privateKey) {
            this.register()
        }
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

    private register() {
        const { privateKey, baseUrl, registrationOptions } = this.options
        this._clientId = jwt.sign(registrationOptions!, config.jwtSecret)
        const assertion = {
            iss: this._clientId,
            sub: this._clientId,
            aud: `${baseUrl}/auth/token`,
            exp: Math.round(Date.now() / 1000) + 300,
            jti: randomBytes(10).toString("hex")
        };
        const privateKeyPEM = jwkToPem(privateKey as jwkToPem.JWK, { private: true })
        this._registrationToken = jwt.sign(assertion, privateKeyPEM, {
            algorithm: privateKey.alg as jwt.Algorithm,
            keyid    : privateKey.kid
        });
    }

    public async getAccessToken() {
        if (!this.options.accessToken && this._registrationToken) {
            const res = await fetch(`${this.options.baseUrl}/auth/token`, {
                method: "POST",
                headers: {
                    "content-type": "application/x-www-form-urlencoded"
                },
                body: new URLSearchParams({
                    grant_type           : "client_credentials",
                    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                    scope                : "system/Patient.rs",
                    client_assertion     : this._registrationToken,
                })
            })
            const json = await res.json()
            this.options.accessToken = json.access_token
        }
        return this.options.accessToken
    }

    private async request(url: string | URL, options: RequestInit = {}) {
        const accessToken = await this.getAccessToken()
        if (accessToken) {
            Object.assign(options, { headers: {
                ...options.headers,
                authorization: `Bearer ${accessToken}`
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

    async waitForCompletion(frequency?: number, exitOn429 = false)
    {
        let res: Response;
        do {
            res = await this.request(this.statusLocation)
            if (res.status === 200) {
                this._manifest = await res.json()
                return this._manifest
            }
            else if (res.status === 429) {
                const operationOutcome: OperationOutcome = await res.json()
                if (exitOn429 || operationOutcome.issue[0].severity === "fatal") {
                    return operationOutcome // exit if terminated
                }
                const f = frequency || +res.headers.get("retry-after")! * 1000
                await wait(Math.max(f, 100))
            }
            else if (res.status === 202) {
                // console.log({
                //     "x-progress" : res.headers.get("x-progress"),
                //     "retry-after": res.headers.get("retry-after"),
                //     loc: this.statusLocation
                // })
                const f = frequency || +res.headers.get("retry-after")! * 1000
                await wait(Math.max(f, 100))
            }
            else {
                return await res.json() // OperationOutcome
            }
        } while (true);
    }

    async download(index?: number)
    {
        if (!index && index !== 0) {
            return Promise.all(this.manifest.output.map(x => this.request(x.url).then(r => r.json())))
        }

        const fileResponse = await this.request(this.manifest.output[index].url)
        return await fileResponse.json()
    }

    async cancel()
    {
        return this.request(this.statusLocation, { method: "DELETE" })
    }
}

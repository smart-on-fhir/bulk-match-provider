import { randomBytes } from "crypto"
import jwt             from "jsonwebtoken"
import jwkToPem        from "jwk-to-pem"
import { JSONObject }  from ".."


export interface BackendServicesClientOptions {
    clientId: string
    
    /** Access token lifetime in seconds */
    accessTokenLifetime?: number

    privateKey: any
    scope: string
    baseUrl: string
}

export default class BackendServicesClient {

    private accessTokenExpiresAt: number = 0;

    private accessToken: string = ""

    private options: BackendServicesClientOptions;

    private wellKnownStatement: JSONObject | null = null

    private capabilityStatement: JSONObject | null = null

    private tokenUrl: string = ""

    constructor(options: BackendServicesClientOptions)
    {
        this.options = options
    }

    public async getWellKnownStatement()
    {
        if (!this.wellKnownStatement) {
            const url = new URL(".well-known/smart-configuration", this.options.baseUrl)
            const res = await fetch(url, { headers: { accept: "application/fhir+json" }})
            this.wellKnownStatement = await res.json()
            
        }
        return this.wellKnownStatement
    }

    public async getCapabilityStatement()
    {
        if (!this.capabilityStatement) {
            const url = new URL("metadata", this.options.baseUrl)
            const res = await fetch(url, { headers: { accept: "application/fhir+json" }})
            this.capabilityStatement = await res.json()
        }
        return this.capabilityStatement
    }

    public async getTokenUrl()
    {
        if (!this.tokenUrl) {
            try {
                const wellKnownStatement = await this.getWellKnownStatement()
                this.tokenUrl = wellKnownStatement!.token_endpoint + ""
            } catch {
                const capabilityStatement = await this.getCapabilityStatement()
                // @ts-ignore
                this.tokenUrl = capabilityStatement.rest[0].security.extension.find(e => {
                    return e.url === "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris"
                }).extension.find((e: any) => e.url === "token").valueUri || ""
            }
        }
        return this.tokenUrl
    }

    public async getAccessToken()
    {
        if (this.accessToken && this.accessTokenExpiresAt - 10 > Date.now() / 1000) {
            return this.accessToken;
        }

        const { clientId, accessTokenLifetime = 200, privateKey } = this.options;
        if (!clientId || !privateKey) {
            return "";
        }

        const tokenUrl = await this.getTokenUrl()

        if (!tokenUrl) {
            return "";
        }

        const claims = {
            iss: clientId,
            sub: clientId,
            aud: tokenUrl,
            exp: Math.round(Date.now() / 1000) + accessTokenLifetime,
            jti: randomBytes(10).toString("hex"),
        };

        const token = jwt.sign(claims, jwkToPem(privateKey, { private: true }), {
            algorithm: privateKey.alg as jwt.Algorithm,
            keyid: privateKey.kid,
        });

        const body = new URLSearchParams();
        body.append("scope", this.options.scope);
        body.append("grant_type", "client_credentials");
        body.append("client_assertion_type", "urn:ietf:params:oauth:client-assertion-type:jwt-bearer");
        body.append("client_assertion", token);

        const res = await fetch(tokenUrl, {
            method: "POST",
            headers: {
                "Content-Type"  : "application/x-www-form-urlencoded",
                "Epic-Client-ID": clientId
            },
            body
        });

        if (res.ok) {
            const json = await res.json();
            console.assert(json, "Authorization request got empty body");
            console.assert(json.access_token, "Authorization response does not include access_token");
            console.assert(json.expires_in, "Authorization response does not include expires_in");
            this.accessToken = json.access_token || "";
            this.accessTokenExpiresAt = this.getAccessTokenExpiration(json);
            return json.access_token;
        }

        return ""
    }

    /**
     * Given a token response, computes and returns the expiresAt timestamp.
     * Note that this should only be used immediately after an access token is
     * received, otherwise the computed timestamp will be incorrect.
     */
    public getAccessTokenExpiration(tokenResponse: any): number {
        const now = Math.floor(Date.now() / 1000);

        // Option 1 - using the expires_in property of the token response
        if (tokenResponse.expires_in) {
            return now + tokenResponse.expires_in;
        }

        // Option 2 - using the exp property of JWT tokens (must not assume JWT!)
        if (tokenResponse.access_token) {
            const tokenBody = jwt.decode(tokenResponse.access_token);
            if (tokenBody && typeof tokenBody == "object" && tokenBody.exp) {
                return tokenBody.exp;
            }
        }

        // Option 3 - if none of the above worked set this to 5 minutes after now
        return now + 300;
    }

    public async request(input: string | URL, options: RequestInit = {}) {
        const accessToken = await this.getAccessToken();
        const _options = { ...options };

        if (accessToken) {
            _options.headers = {
                ..._options.headers,
                authorization: `Bearer ${accessToken}`,
            };
        }

        const url = new URL(input, this.options.baseUrl)

        return fetch(url, _options);
    }
}

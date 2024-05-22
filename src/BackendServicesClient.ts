import { randomBytes } from "crypto"
import jwt             from "jsonwebtoken"
import jwkToPem        from "jwk-to-pem"
import { JSONObject }  from ".."


/**
 * Options passed to the BackendServicesClient constructor
 */
export interface BackendServicesClientOptions {
    
    /**
     * The client ID as obtained from the auth server after registration.
     * Set this to empty string for open servers.
     */
    clientId: string
    
    /**
     * Access token lifetime in seconds
     */
    accessTokenLifetime?: number

    /**
     * The private key as JWK or null for open servers
     */
    privateKey: any

    /**
     * Space separated list of one or more scopes to be requested by the remote
     * server. Ignored if we are connecting to an open server
     */
    scope: string

    /**
     * The baseUrl of the server we want to connect to
     */
    baseUrl: string
}

/**
 * A client for servers supporting the SMART BackendServices authentication.
 * Alternatively, this can also be used against open servers without any
 * authentication.
 */
export default class BackendServicesClient {

    /**
     * Keep track of when the current access token (if any) will expire
     */
    private accessTokenExpiresAt: number = 0;

    /**
     * The current access token (if any)
     */
    private accessToken: string = ""

    /**
     * The instance options as passed to the constructor
     */
    private options: BackendServicesClientOptions;

    /**
     * If a well-known statement is downloaded it is cached here so that we
     * don't need to download it again next time we need to get an access token
     */
    private wellKnownStatement: JSONObject | null = null

    /**
     * If a CapabilityStatement is downloaded it is cached here so that we
     * don't need to download it again next time we need to get an access token
     */
    private capabilityStatement: JSONObject | null = null

    /**
     * The token URL as discovered from the CapabilityStatement of from the
     * well-known statement
     */
    private tokenUrl: string = ""

    /**
     * The only purpose of this constructor is to remember the passed options
     */
    constructor(options: BackendServicesClientOptions)
    {
        this.options = options
    }

    /**
     * Try to download the well-known statement from the remote server. Returns
     * the result but also stores it internally so that it is not downloaded
     * again in future calls.
     */
    public async getWellKnownStatement()
    {
        if (!this.wellKnownStatement) {
            const url = new URL(".well-known/smart-configuration", this.options.baseUrl)
            const res = await fetch(url, { headers: { accept: "application/fhir+json" }})
            this.wellKnownStatement = await res.json()
            
        }
        return this.wellKnownStatement
    }

    /**
     * Try to download the CapabilityStatement from the remote server. Returns
     * the result but also stores it internally so that it is not downloaded
     * again in future calls.
     */
    public async getCapabilityStatement()
    {
        if (!this.capabilityStatement) {
            const url = new URL("metadata", this.options.baseUrl)
            const res = await fetch(url, { headers: { accept: "application/fhir+json" }})
            this.capabilityStatement = await res.json()
        }
        return this.capabilityStatement
    }

    /**
     * Gets the token URL from the wellKnownStatement, or from the capability
     * statement otherwise.
     */
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

    /**
     * Gets the current access token.
     * - If the token is not available (when called for the first time) a new
     *   access token is requested and stored.
     * - If the access token is expired or is about to expire within the next
     *   10 seconds, new token will be obtained. This provides an automatic
     *   token refresh mechanism.
     */
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

    /**
     * The request method is a wrapper around the native fetch. It will try to
     * obtain an access token and append it to the authentication header
     */
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

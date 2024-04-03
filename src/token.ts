import { Request, Response }                 from "express"
import jwt, { Algorithm }                    from "jsonwebtoken"
import jwkToPem                              from "jwk-to-pem"
import config                                from "./config"
import { asyncRouteWrap, getRequestBaseURL } from "./lib"
import {
    InvalidClientError,
    InvalidGrantError,
    InvalidRequestError,
    InvalidScopeError,
    UnsupportedGrantTypeError
} from "./OAuthError"


export const tokenHandler = asyncRouteWrap(async (req: Request, res: Response) => {

    const baseUrl = getRequestBaseURL(req)

    // Require "application/x-www-form-urlencoded" POSTs -----------------------
    let ct = req.headers["content-type"] || "";
    if (ct.indexOf("application/x-www-form-urlencoded") !== 0) {
        throw new InvalidRequestError(
            "Invalid request content-type header (must be 'application/x-www-form-urlencoded')"
        );
    }

    // grant_type --------------------------------------------------------------
    if (!req.body.grant_type) {
        throw new InvalidGrantError("Missing grant_type parameter");
    }

    if (req.body.grant_type != "client_credentials") {
        throw new UnsupportedGrantTypeError(
            "The grant_type parameter should equal 'client_credentials'"
        );
    }

    // client_assertion_type ---------------------------------------------------
    if (!req.body.client_assertion_type) {
        throw new InvalidRequestError("Missing client_assertion_type parameter");
    }

    if (req.body.client_assertion_type !== "urn:ietf:params:oauth:client-assertion-type:jwt-bearer") {
        throw new InvalidRequestError(
            "Invalid client_assertion_type parameter. Must be 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'."
        );
    }

    // client_assertion must be a token ----------------------------------------
    if (!req.body.client_assertion) {
        throw new InvalidRequestError("Missing client_assertion parameter");
    }
    
    const authenticationToken = jwt.decode(req.body.client_assertion, { complete: true, json: true });
    
    if (!authenticationToken) {
        throw new InvalidRequestError("Invalid registration token");
    }

    const authenticationTokenPayload = authenticationToken.payload as jwt.JwtPayload
    const authenticationTokenHeaders = authenticationToken.header

    // The client_id must be a token -------------------------------------------
    if (!authenticationTokenPayload.sub || !authenticationTokenPayload.iss || authenticationTokenPayload.sub !== authenticationTokenPayload.iss) {
        throw new InvalidRequestError(
            "The client ID must be set at both the iss and sub claims of the registration token"
        );
    }
    
    const clientDetailsToken = jwt.decode(authenticationTokenPayload.sub as string, { complete: true, json: true });

    if (!clientDetailsToken) {
        throw new InvalidRequestError("Invalid client ID");
    }

    const clientDetailsTokenPayload = clientDetailsToken.payload as jwt.JwtPayload

    // simulate expired registration token error -------------------------------
    if (clientDetailsTokenPayload.err === "expired_registration_token") {
        throw new InvalidRequestError("Registration token expired (simulated error)");
    }

    // simulated invalid scope error -------------------------------------------
    if (clientDetailsTokenPayload.err === "invalid_scope") {
        throw new InvalidScopeError("Invalid scope (simulated error)");
    }

    // simulated invalid client error -------------------------------------------
    if (clientDetailsTokenPayload.err === "invalid_client") {
        throw new InvalidClientError("Invalid client (simulated error)");
    }

    // Validate authenticationToken.aud (must equal this url) ------------------
    const tokenUrl = baseUrl + req.originalUrl;
    const aud = (authenticationTokenPayload as jwt.JwtPayload).aud + ""
    if (tokenUrl.replace(/^https?/, "") !== aud.replace(/^https?/, "")) {
        throw new InvalidGrantError(`Invalid token 'aud' claim. Must be '${tokenUrl}'.`);
    }

    // Get the "kid" from the authentication token header
    let kid = authenticationTokenHeaders.kid!;

    if (!authenticationTokenHeaders.kid) {
        throw new InvalidRequestError("The registration header must have a kid header");
    }

    // If the jku header is present, verify that the jku is whitelisted
    // (i.e., that it matches the value supplied at registration time for
    // the specified `client_id`). If the jku header is not whitelisted, the
    // signature verification fails.
    if (authenticationTokenHeaders.jku && authenticationTokenHeaders.jku !== clientDetailsTokenPayload.jwks_url) {
        throw new InvalidGrantError(
            `The provided jku '${authenticationTokenHeaders.jku
            }' is different than the one used at registration time (${
            clientDetailsTokenPayload.jwks_url})`
        );
    }

    try {
        var publicKeys = await getPublicKeys({
            kid,
            jwks_url: clientDetailsTokenPayload.jwks_url,
            jwks    : clientDetailsTokenPayload.jwks
        })
    } catch (ex) {
        throw new InvalidRequestError(
            `Unable to obtain public keys: '${(ex as Error).message}'`
        );
    }

    if (!publicKeys.length) {
        throw new InvalidGrantError(
            `No public keys found in the JWKS with "kid" equal to "${kid}"`
        );
    }

    // Attempt to verify the JWK using each key in the potential keys list.
    const verified = publicKeys.some(key => {
        try {
            jwt.verify(req.body.client_assertion, jwkToPem(key), {
                algorithms: config.supportedAlgorithms as Algorithm[]
            })
            return true
        } catch {
            return false
        }
    })

    if (!verified) {
        throw new InvalidGrantError(
            "Unable to verify the token with any of the public keys found in the JWKS"
        );
    }

    if (!req.body.scope) {
        throw new InvalidRequestError("Missing scope parameter");
    }

    const grantedScopes = negotiateScopes(req.body.scope)
        
    if (!grantedScopes.length) {
        throw new InvalidScopeError(
            `No access could be granted for scopes "${req.body.scope}".`
        );
    }
    
    // Here, expiresIn is set to the server settings for token lifetime.
    // However, if the authentication token has shorter lifetime it will
    // also be used for the access token.
    const expiresIn = Math.round(Math.min(
        authenticationTokenPayload.exp! - Math.floor(Date.now() / 1000),
        (clientDetailsTokenPayload.accessTokensExpireIn ?
            clientDetailsTokenPayload.accessTokensExpireIn * 60 :
            config.accessTokenLifetime * 60)
    ));

    const tokenBody: any = {
        token_type: "bearer",
        scope     : grantedScopes.join(" "),
        client_id : authenticationTokenPayload.sub,
        expires_in: expiresIn
    };
    
    tokenBody.access_token = jwt.sign(tokenBody, config.jwtSecret, {
        expiresIn,
        // algorithm: 
    });

    res.json(tokenBody);
});

async function getPublicKeys({ jwks_url, jwks, kid }: {
    jwks_url?: string
    jwks    ?: { keys: any[] }
    kid      : string
}) {

    const keys = []

    if (jwks_url) {
        const keySet = await fetchJwksUrl(jwks_url)
        keys.push(...keySet.keys)
    }
    
    if (jwks?.keys) {
        keys.push(...jwks.keys)
    }

    // Filter the potential keys to retain only those where the `kid` matches
    // the value supplied in the client's JWK header.
    return keys.filter((key: JsonWebKey) => {
        if (!Array.isArray(key.key_ops) || key.key_ops.indexOf("verify") === -1) {
            return false;
        }
        // return (key.kid === kid && key.kty === header.kty);
        // @ts-ignore
        return key.kid === kid;
    });
}

async function fetchJson(input: string | URL | globalThis.Request, options?: RequestInit)
{
    return fetch(input, options).then(res => res.json())
}

async function fetchJwksUrl(input: string | URL | globalThis.Request, options?: RequestInit)
{
    return fetchJson(input, options).then(json => {
        if (!Array.isArray(json.keys)) {
            throw new Error("The remote jwks object has no keys array.")
        }
        return json
    })
}

function negotiateScopes(list: string) {
    const scopes = list.trim().split(/\s+/)
    return scopes.filter(s => s === "system/Patient.read") // FIXME: What scopes should we support?
}

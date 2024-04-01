import { Request, Response } from "express"
import jwt, { Algorithm }    from "jsonwebtoken"
import jwkToPem              from "jwk-to-pem"
import config                from "./config"
import { asyncRouteWrap, getRequestBaseURL, replyWithOAuthError } from "./lib"


// -----------------------------------------------------------------------------
// client_id token `err` possible values
// -----------------------------------------------------------------------------
// expired_registration_token
// invalid_scope
// invalid_client
// invalid_access_token
// expired_access_token
// -----------------------------------------------------------------------------
// client_id token `accessTokensExpireIn` = time in minutes
// -----------------------------------------------------------------------------


export const tokenHandler = asyncRouteWrap(async (req: Request, res: Response) => {

    const baseUrl = getRequestBaseURL(req)

    // Require "application/x-www-form-urlencoded" POSTs -----------------------
    let ct = req.headers["content-type"] || "";
    if (ct.indexOf("application/x-www-form-urlencoded") !== 0) {
        return replyWithOAuthError(
            res,
            "invalid_request",
            "Invalid request content-type header (must be 'application/x-www-form-urlencoded')"
        );
    }

    // grant_type --------------------------------------------------------------
    if (!req.body.grant_type) {
        return replyWithOAuthError(
            res,
            "invalid_grant",
            "Missing grant_type parameter"
        );
    }

    if (req.body.grant_type != "client_credentials") {
        return replyWithOAuthError(
            res,
            "unsupported_grant_type",
            "The grant_type parameter should equal 'client_credentials'"
        );
    }

    // client_assertion_type ---------------------------------------------------
    if (!req.body.client_assertion_type) {
        return replyWithOAuthError(res, "invalid_request", "Missing client_assertion_type parameter");
    }

    if (req.body.client_assertion_type !== "urn:ietf:params:oauth:client-assertion-type:jwt-bearer") {
        return replyWithOAuthError(res, "invalid_request", "Invalid client_assertion_type parameter. Must be 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'.");
    }

    // client_assertion must be a token ----------------------------------------
    if (!req.body.client_assertion) {
        return replyWithOAuthError(res, "invalid_request", "Missing client_assertion parameter");
    }
    
    const authenticationToken = jwt.decode(req.body.client_assertion, { complete: true, json: true });
    
    if (!authenticationToken) {
        return replyWithOAuthError(res, "invalid_request", "Invalid registration token");
    }

    const authenticationTokenPayload = authenticationToken.payload as jwt.JwtPayload
    const authenticationTokenHeaders = authenticationToken.header

    // The client_id must be a token -------------------------------------------
    if (!authenticationTokenPayload.sub || !authenticationTokenPayload.iss || authenticationTokenPayload.sub !== authenticationTokenPayload.iss) {
        return replyWithOAuthError(res, "invalid_request", "The client ID must be set at both the iss and sub claims of the registration token");
    }
    
    const clientDetailsToken = jwt.decode(authenticationTokenPayload.sub as string, { complete: true, json: true });

    if (!clientDetailsToken) {
        return replyWithOAuthError(res, "invalid_request", "Invalid client ID");
    }

    const clientDetailsTokenPayload = clientDetailsToken.payload as jwt.JwtPayload

    // simulate expired registration token error -------------------------------
    if (clientDetailsTokenPayload.err === "expired_registration_token") {
        return replyWithOAuthError(res, "invalid_request", "Registration token expired (simulated error)");
    }

    // simulated invalid scope error -------------------------------------------
    if (clientDetailsTokenPayload.err === "invalid_scope") {
        return replyWithOAuthError(res, "invalid_scope", "Invalid scope (simulated error)");
    }

    // simulated invalid client error -------------------------------------------
    if (clientDetailsTokenPayload.err === "invalid_client") {
        return replyWithOAuthError(res, "invalid_client", "Invalid client (simulated error)", 401);
    }

    // Validate authenticationToken.aud (must equal this url) ------------------
    const tokenUrl = baseUrl + req.originalUrl;
    const aud = (authenticationTokenPayload as jwt.JwtPayload).aud + ""
    if (tokenUrl.replace(/^https?/, "") !== aud.replace(/^https?/, "")) {
        return replyWithOAuthError(res, "invalid_grant", `Invalid token 'aud' claim. Must be '${tokenUrl}'.`);
    }

    // Get the "kid" from the authentication token header
    let kid = authenticationTokenHeaders.kid!;

    if (!authenticationTokenHeaders.kid) {
        return replyWithOAuthError(res, "invalid_request", "The registration header must have a kid header");
    }

    // If the jku header is present, verify that the jku is whitelisted
    // (i.e., that it matches the value supplied at registration time for
    // the specified `client_id`). If the jku header is not whitelisted, the
    // signature verification fails.
    if (authenticationTokenHeaders.jku && authenticationTokenHeaders.jku !== clientDetailsTokenPayload.jwks_url) {
        return replyWithOAuthError(
            res,
            "invalid_grant",
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
        return replyWithOAuthError(
            res,
            "invalid_request",
            `Unable to obtain public keys: '${(ex as Error).message}'`
        );
    }

    if (!publicKeys.length) {
        return replyWithOAuthError(
            res,
            "invalid_grant",
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
        return replyWithOAuthError(
            res,
            "invalid_grant",
            "Unable to verify the token with any of the public keys found in the JWKS"
        );
    }

    if (!req.body.scope) {
        return replyWithOAuthError(res, "invalid_request", "Missing scope parameter");
    }

    const grantedScopes = negotiateScopes(req.body.scope)
        
    if (!grantedScopes.length) {
        return replyWithOAuthError(
            res,
            "invalid_scope",
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
    
    tokenBody.access_token = jwt.sign(tokenBody, config.jwtSecret, { expiresIn });

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
    return scopes.filter(s => s === "system/patient.read") // FIXME: What scopes should we support?
}

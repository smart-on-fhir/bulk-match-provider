import { randomBytes }      from "crypto"
import { Server }           from "http"
import assert               from "node:assert/strict"
import jwt, { SignOptions } from "jsonwebtoken"
import jwkToPem             from "jwk-to-pem"
import moment               from "moment"
import run                  from "../src/index"
import config               from "../src/config"
import { wait }             from "../src/lib"
import patients             from "../src/patients"
import MockServer           from "./MockServer"
import app                  from ".."
import "./init-tests"

const PUBLIC_KEY = {
    "kty": "EC",
    "crv": "P-384",
    "x": "3K1Lw7Qkjj5LWSk5NnIwWmkb5Yo2GkcwVtnM8xhhGdM0bI3B632QMZmqtRHQ5APJ",
    "y": "CBqiq5QwE8EyUxw2_oDJzVHrY5j22ny9KbRCK5vABppaGO4x8MxnTWfQMtGIbVQN",
    "key_ops": [ "verify" ],
    "ext": true,
    "kid": "b37fcf0b5801fde3af48bd55fd95117e",
    "alg": "ES384"
}

const PRIVATE_KEY = {
    "kty": "EC",
    "crv": "P-384",
    "d": "tb7pcRThbZ8gHMFLZXJLMG48U0euuiPqSHBsOYPR2Bqsdq9rEq4Pi6LiOo890Qm8",
    "x": "3K1Lw7Qkjj5LWSk5NnIwWmkb5Yo2GkcwVtnM8xhhGdM0bI3B632QMZmqtRHQ5APJ",
    "y": "CBqiq5QwE8EyUxw2_oDJzVHrY5j22ny9KbRCK5vABppaGO4x8MxnTWfQMtGIbVQN",
    "key_ops": [ "sign" ],
    "ext": true,
    "kid": "b37fcf0b5801fde3af48bd55fd95117e",
    "alg": "ES384"
}

const DEFAULT_CLIENT_ID = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InJ" +
    "lZ2lzdHJhdGlvbi10b2tlbiJ9.eyJqd2tzX3VybCI6Imh0dHBzOi8vYnVsay" +
    "1kYXRhLnNtYXJ0aGVhbHRoaXQub3JnL2tleXMvRVMzODQucHVibGljLmpzb2" +
    "4iLCJhY2Nlc3NUb2tlbnNFeHBpcmVJbiI6MTUsImlhdCI6MTcxMTU0OTQ5Mn" +
    "0.0FAliOuANtkmMR_utZQLAFFmcyXgz81fWsl2ByG-Vt8";

// -----------------------------------------------------------------------------







async function match(baseUrl: string, {
    resource,
    onlyCertainMatches,
    onlySingleMatch,
    count,
    _outputFormat,
    headers
}: {
    resource?: (fhir4.Patient | any)[]
    onlyCertainMatches?: any
    onlySingleMatch?: any
    count?: any
    _outputFormat?: any,
    headers?: HeadersInit
} = {}) {
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

    return fetch(`${baseUrl}/fhir/Patient/$bulk-match`, {
        method : "POST",
        body: JSON.stringify(body),
        headers: {
            "Content-Type": "application/json",
            accept: "application/fhir+ndjson",
            ...headers
        }
    })
}

function expectOperationOutcome(json: any, {
    severity,
    code,
    diagnostics
}: {
    severity?: string
    code?: number
    diagnostics?: string | RegExp
} = {}) {
    assert.equal(json.resourceType, "OperationOutcome")
    if (severity) {
        assert.equal(json.issue[0].severity, severity)
    }
    if (code) {
        assert.equal(json.issue[0].code, code)
    }
    if (diagnostics) {
        if (diagnostics instanceof RegExp) {
            assert.match(json.issue[0].diagnostics || "", diagnostics)
        } else {
            assert.equal(json.issue[0].diagnostics, diagnostics)
        }
    }
}

function expectOAuthError(json: any, {
    error,
    error_description
}: {
    error?: string | RegExp
    error_description?: string | RegExp
} = {}) {
    assert.ok(json && typeof json === "object", "OAuth error responses must be objects")
    assert.ok(typeof json.error === "string", "OAuth errors must have error property")
    assert.ok(typeof json.error_description === "string", "OAuth errors must have error_description property")
    if (error) {
        if (error instanceof RegExp) {
            assert.match(json.error, error)
        } else {
            assert.equal(json.error, error)
        }
    }
    if (error_description) {
        if (error_description instanceof RegExp) {
            assert.match(json.error_description, error_description)
        } else {
            assert.equal(json.error_description, error_description)
        }
    }
}

describe("API", () => {

    const mockServer = new MockServer("MockServer", true)
    let server : Server
    let baseUrl: string


    before(async () => await mockServer.start())

    after(async () => await mockServer.stop())

    afterEach(() => mockServer.clear())

    before(async () => {
        const { address, server: _server } = await run()
        baseUrl = address
        server  = _server
    })

    after((next) => {
        if (server?.listening) {
            server.close(next)
        } else {
            next()
        }
    })

    function requestAccessToken(token: string, scope = "system/Patient.read") {
        return fetch(`${baseUrl}/auth/token`, {
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

    function generateRegistrationToken({
        clientId,
        lifetime = 300,
        privateKey = PRIVATE_KEY,
        claimsOverride = {},
        signOptionsOverride = {}
    }: {
        clientId: string
        lifetime?: number
        privateKey?: any
        claimsOverride?: Record<string, any>
        signOptionsOverride?: SignOptions
    }) {
        const claims = {
            iss: clientId,
            sub: clientId,
            aud: `${baseUrl}/auth/token`,
            exp: Math.round(Date.now() / 1000) + lifetime,
            jti: randomBytes(10).toString("hex"),
            ...claimsOverride
        };
        const privateKeyPEM = jwkToPem(privateKey as jwkToPem.JWK, { private: true })
        return jwt.sign(claims, privateKeyPEM, {
            algorithm: privateKey.alg as jwt.Algorithm,
            keyid    : privateKey.kid,
            ...signOptionsOverride
        });
    }

    describe("auth", () => {

        describe("registration endpoint", () => {
            it ("requires 'content-type' header of 'application/x-www-form-urlencoded'", async () => {
                const res = await fetch(`${baseUrl}/auth/register`, {
                    method: "POST"
                })
                assert.equal(res.status, 400)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_request',
                    error_description: "Invalid request content-type header (must be 'application/x-www-form-urlencoded')"
                })
            })

            it ("rejects invalid 'content-type' header", async () => {
                const res = await fetch(`${baseUrl}/auth/register`, {
                    method: "POST",
                    headers: { "content-type": "text/plain" }
                })
                assert.equal(res.status, 400)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_request',
                    error_description: "Invalid request content-type header (must be 'application/x-www-form-urlencoded')"
                })
            })

            it ("either jwks or jwks_url is required", async () => {
                const res = await fetch(`${baseUrl}/auth/register`, {
                    method: "POST",
                    headers: { "content-type": "application/x-www-form-urlencoded" }
                })
                assert.equal(res.status, 400)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_request',
                    error_description: "Either 'jwks' or 'jwks_url' is required"
                })
            })

            it ("detects bad jwks json", async () => {
                const res = await fetch(`${baseUrl}/auth/register`, {
                    method: "POST",
                    headers: { "content-type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({ jwks: "my-jwks" })
                })
                assert.equal(res.status, 400)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_request',
                    error_description: "Cannot parse 'jwks' as JSON"
                })
            })

            it ("jwks can be omitted", async () => {
                const res = await fetch(`${baseUrl}/auth/register`, {
                    method: "POST",
                    headers: { "content-type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({ jwks_url: "my-jwks-url" })
                })
                assert.equal(res.status, 200)
            })

            it ("jwks_url can be omitted", async () => {
                const res = await fetch(`${baseUrl}/auth/register`, {
                    method: "POST",
                    headers: { "content-type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({ jwks: '{"keys":[]}' })
                })
                assert.equal(res.status, 200)
            })

            it ("works as expected", async () => {
                const res = await fetch(`${baseUrl}/auth/register`, {
                    method: "POST",
                    headers: { "content-type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({
                        jwks                : '{ "my-jwks": true }',
                        jwks_url            : "my-jwks_url",
                        accessTokensExpireIn: "22",
                        fakeMatch           : "33",
                        duplicates          : "44",
                        err                 : "my-err"
                    })
                })
                assert.equal(res.status, 200)
                const text = await res.text()
                const token = jwt.decode(text) as any
                assert.deepEqual(token.jwks, { 'my-jwks': true })
                assert.equal(token.jwks_url, "my-jwks_url")
                assert.equal(token.accessTokensExpireIn, 22)
                assert.equal(token.fakeMatches, 33)
                assert.equal(token.duplicates, 44)
                assert.equal(token.err, "my-err")
            })
        })

        describe("token endpoint", () => {
            it ("requires 'content-type' header of 'application/x-www-form-urlencoded'", async () => {
                const res = await fetch(`${baseUrl}/auth/token`, {
                    method: "POST"
                })
                assert.equal(res.status, 400)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_request',
                    error_description: "Invalid request content-type header (must be 'application/x-www-form-urlencoded')"
                })
            })

            it ("requires 'grant_type' parameter to be present", async () => {
                const res = await fetch(`${baseUrl}/auth/token`, {
                    method: "POST",
                    headers: {
                        "content-type": "application/x-www-form-urlencoded"
                    }
                })
                assert.equal(res.status, 403)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_grant',
                    error_description: "Missing grant_type parameter"
                })
            })

            it ("requires the 'grant_type' parameter to equal 'client_credentials'", async () => {
                const res = await fetch(`${baseUrl}/auth/token`, {
                    method: "POST",
                    headers: {
                        "content-type": "application/x-www-form-urlencoded"
                    },
                    body: new URLSearchParams({ grant_type: "bad-grant-type" })
                })
                assert.equal(res.status, 400)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'unsupported_grant_type',
                    error_description: "The grant_type parameter should equal 'client_credentials'"
                })
            })

            it ("requires the 'client_assertion_type' parameter to be present", async () => {
                const res = await fetch(`${baseUrl}/auth/token`, {
                    method: "POST",
                    headers: {
                        "content-type": "application/x-www-form-urlencoded"
                    },
                    body: new URLSearchParams({ grant_type: "client_credentials" })
                })
                assert.equal(res.status, 400)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_request',
                    error_description: "Missing client_assertion_type parameter"
                })
            })

            it ("requires the 'client_assertion_type' parameter to equal 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'", async () => {
                const res = await fetch(`${baseUrl}/auth/token`, {
                    method: "POST",
                    headers: {
                        "content-type": "application/x-www-form-urlencoded"
                    },
                    body: new URLSearchParams({
                        grant_type: "client_credentials",
                        client_assertion_type: "bad-assertion-type"
                    })
                })
                assert.equal(res.status, 400)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_request',
                    error_description: "Invalid client_assertion_type parameter. Must be 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'."
                })
            })

            it ("requires the 'client_assertion' parameter to be present", async () => {
                const res = await fetch(`${baseUrl}/auth/token`, {
                    method: "POST",
                    headers: {
                        "content-type": "application/x-www-form-urlencoded"
                    },
                    body: new URLSearchParams({
                        grant_type: "client_credentials",
                        client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer"
                    })
                })
                assert.equal(res.status, 400)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_request',
                    error_description: "Missing client_assertion parameter"
                })
            })

            it ("requires the 'client_assertion' parameter to be a JWT", async () => {
                const res = await fetch(`${baseUrl}/auth/token`, {
                    method: "POST",
                    headers: {
                        "content-type": "application/x-www-form-urlencoded"
                    },
                    body: new URLSearchParams({
                        grant_type           : "client_credentials",
                        client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                        client_assertion     : "...bad-token.d.f.gs"
                    })
                })
                assert.equal(res.status, 400)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_request',
                    error_description: /Invalid registration token/i
                })
            })

            it ("requires the client_id to be set in the 'sub' claim", async () => {
                const tokenUrl = `${baseUrl}/auth/token`
                const clientId = "whatever"
                const claims = {
                    iss: clientId,
                    // sub: clientId,
                    aud: tokenUrl,
                    exp: Math.round(Date.now() / 1000) + 300,
                    jti: randomBytes(10).toString("hex")
                };
                const privateKeyPEM = jwkToPem(PRIVATE_KEY as jwkToPem.JWK, { private: true })
                const token = jwt.sign(claims, privateKeyPEM, {
                    algorithm: PRIVATE_KEY.alg as jwt.Algorithm,
                    keyid    : PRIVATE_KEY.kid
                });
                const res = await fetch(tokenUrl, {
                    method: "POST",
                    headers: {
                        "content-type": "application/x-www-form-urlencoded"
                    },
                    body: new URLSearchParams({
                        grant_type           : "client_credentials",
                        client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                        client_assertion     : token
                    })
                })
                assert.equal(res.status, 400)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_request',
                    error_description: /The client ID must be set at both the iss and sub/i
                })
            })

            it ("requires the client_id in the 'sub' claim to be a JWT", async () => {
                const tokenUrl = `${baseUrl}/auth/token`
                const clientId = "whatever"
                const claims = {
                    iss: clientId,
                    sub: clientId,
                    aud: tokenUrl,
                    exp: Math.round(Date.now() / 1000) + 300,
                    jti: randomBytes(10).toString("hex")
                };
                const privateKeyPEM = jwkToPem(PRIVATE_KEY as jwkToPem.JWK, { private: true })
                const token = jwt.sign(claims, privateKeyPEM, {
                    algorithm: PRIVATE_KEY.alg as jwt.Algorithm,
                    keyid    : PRIVATE_KEY.kid
                });
                const res = await fetch(tokenUrl, {
                    method: "POST",
                    headers: {
                        "content-type": "application/x-www-form-urlencoded"
                    },
                    body: new URLSearchParams({
                        grant_type           : "client_credentials",
                        client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
                        client_assertion     : token
                    })
                })
                assert.equal(res.status, 400)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_request',
                    error_description: "Invalid client ID"
                })
            })

            it ("Validates authenticationToken.aud", async () => {
                const tokenUrl  = `${baseUrl}/auth/token`
                const assertion = generateRegistrationToken({
                    clientId: DEFAULT_CLIENT_ID,
                    claimsOverride: { aud: "" }
                })
                const res = await requestAccessToken(assertion)

                assert.equal(res.status, 403)
                    const json = await res.json()
                    expectOAuthError(json, {
                        error: 'invalid_grant',
                        error_description: `Invalid token 'aud' claim. Must be '${tokenUrl}'.`
                    })
            })

            it ("Validates authenticationToken's jku header", async () => {
                const assertion = generateRegistrationToken({
                    clientId: DEFAULT_CLIENT_ID,
                    signOptionsOverride: {
                        header: {
                            alg: PRIVATE_KEY.alg,
                            jku: "whatever"
                        }
                    }
                })
                const res = await requestAccessToken(assertion)
                assert.equal(res.status, 403)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_grant',
                    error_description: /The provided jku '.*?' is different than the one used at registration time (.*?)/
                })
            })

            it ("Can extract public keys from jwks url", async () => {
                mockServer.mock("/keys", { body: { keys: [ PUBLIC_KEY ]}})
                const jwks_url = `${mockServer.baseUrl}/keys`
                const clientId = jwt.sign({ jwks_url }, config.jwtSecret)
                const assertion = generateRegistrationToken({
                    clientId,
                    claimsOverride: {
                        jwks_url
                    },
                    signOptionsOverride: {
                        header: {
                            alg: PRIVATE_KEY.alg,
                            jku: jwks_url
                        }
                    }
                })
                const res = await requestAccessToken(assertion)
                assert.equal(res.status, 200)
            })

            it ("Can extract public keys from jwks url + inline jwks", async () => {
                mockServer.mock("/keys", { body: { keys: [ PUBLIC_KEY ]}})
                const jwks_url = `${mockServer.baseUrl}/keys`
                const clientId = jwt.sign({
                    jwks_url,
                    jwks: { keys: [ PUBLIC_KEY ] }
                }, config.jwtSecret)
                const assertion = generateRegistrationToken({
                    clientId,
                    claimsOverride: {
                        jwks_url
                    },
                    signOptionsOverride: {
                        header: {
                            alg: PRIVATE_KEY.alg,
                            jku: jwks_url
                        }
                    }
                })
                const res = await requestAccessToken(assertion)
                // console.log(await res.text())
                assert.equal(res.status, 200)
            })

            it ("Rejects invalid public keys", async () => {
                mockServer.mock("/keys", { body: { keys: [
                    { ...PUBLIC_KEY, key_ops: [] },
                    { ...PUBLIC_KEY, key_ops: null }
                ]}})
                const jwks_url = `${mockServer.baseUrl}/keys`
                const clientId = jwt.sign({ jwks_url }, config.jwtSecret)
                const assertion = generateRegistrationToken({ clientId, claimsOverride: { jwks_url }})
                const res = await requestAccessToken(assertion)
                assert.equal(res.status, 403)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_grant',
                    error_description: /No public keys found in the JWKS/
                })
            })

            it ("Rejects invalid jwks url response", async () => {
                mockServer.mock("/keys", { body: {} })
                const jwks_url  = `${mockServer.baseUrl}/keys`
                const clientId  = jwt.sign({ jwks_url }, config.jwtSecret)
                const assertion = generateRegistrationToken({ clientId, claimsOverride: { jwks_url }})
                const res       = await requestAccessToken(assertion)
                assert.equal(res.status, 400)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_request',
                    error_description: "Unable to obtain public keys: 'The remote jwks object has no keys array.'"
                })
            })

            it ("Rejects if we have valid public keys but they can't verify the token", async () => {
                mockServer.mock("/keys", { body: {
                    keys: [
                        { ...PUBLIC_KEY, x: "3K1Lw7Qkjj5LWSk5NnIwWmkb5Yo2GkcwVtnM8xhhGdM0bI3B632QMZmqtRHQ5APF" }
                    ]
                } })
                const jwks_url  = `${mockServer.baseUrl}/keys`
                const clientId  = jwt.sign({ jwks_url }, config.jwtSecret)
                const assertion = generateRegistrationToken({ clientId, claimsOverride: { jwks_url }})
                const res = await requestAccessToken(assertion)
                // console.log(await res.text())
                assert.equal(res.status, 403)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_grant',
                    error_description: "Unable to verify the token with any of the public keys found in the JWKS"
                })
            })

            it (`Access token lifetime cannot exceed ${config.maxAccessTokenLifetime} minutes`, async () => {
                const clientId  = jwt.sign({ jwks: { keys: [ PUBLIC_KEY ] }, accessTokensExpireIn: config.maxAccessTokenLifetime + 10 }, config.jwtSecret)
                const assertion = generateRegistrationToken({ clientId })
                const res       = await requestAccessToken(assertion)
                assert.equal(res.status, 200)
                const json: app.AccessTokenResponse = await res.json()
                assert.ok(
                    json.expires_in >= (config.maxAccessTokenLifetime - 1) * 60 &&
                    json.expires_in <= (config.maxAccessTokenLifetime + 1) * 60
                )
            })

            it (`Access token lifetime can be controlled during authentication`, async () => {
                const clientId  = jwt.sign({ jwks: { keys: [ PUBLIC_KEY ] } }, config.jwtSecret)
                const assertion = generateRegistrationToken({ clientId, lifetime: 10 })
                const res       = await requestAccessToken(assertion)
                assert.equal(res.status, 200)
                const json: app.AccessTokenResponse = await res.json()
                assert.ok(json.expires_in >= 9 * 60 && json.expires_in <= 11 * 60)
            })

            it ("Can control the access token lifetime at registration", async () => {
                const clientId  = jwt.sign({ jwks: { keys: [ PUBLIC_KEY ] }, accessTokensExpireIn: 2 }, config.jwtSecret)
                const assertion = generateRegistrationToken({ clientId })
                const res       = await requestAccessToken(assertion)
                assert.equal(res.status, 200)
                const json: app.AccessTokenResponse = await res.json()
                // console.log(json)
                assert.ok(json.expires_in >= 1 * 60 && json.expires_in <= 3 * 60)
            })

            it ("Can simulate expired_registration_token error", async () => {
                const clientId  = jwt.sign({ err: "expired_registration_token" }, config.jwtSecret)
                const assertion = generateRegistrationToken({ clientId })
                const res       = await requestAccessToken(assertion)
                assert.equal(res.status, 400)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_request',
                    error_description: "Registration token expired (simulated error)"
                })
            })

            it ("Can simulate invalid_scope error", async () => {
                const clientId  = jwt.sign({ err: "invalid_scope" }, config.jwtSecret)
                const assertion = generateRegistrationToken({ clientId })
                const res       = await requestAccessToken(assertion)
                assert.equal(res.status, 403)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_scope',
                    error_description: "Invalid scope (simulated error)"
                })
            })

            it ("Can simulate invalid_client error", async () => {
                const clientId  = jwt.sign({ err: "invalid_client" }, config.jwtSecret)
                const assertion = generateRegistrationToken({ clientId })
                const res       = await requestAccessToken(assertion)
                assert.equal(res.status, 401)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_client',
                    error_description: "Invalid client (simulated error)"
                })
            })

            it ("Can simulate invalid_client error", async () => {
                const clientId  = jwt.sign({ jwks: { keys: [ PUBLIC_KEY]}}, config.jwtSecret)
                const assertion = generateRegistrationToken({ clientId, signOptionsOverride: {
                    header: {
                        alg: PRIVATE_KEY.alg,
                        kid: undefined
                    }
                }})
                const res = await requestAccessToken(assertion)
                assert.equal(res.status, 400)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_request',
                    error_description: "The registration header must have a kid header"
                })
            })

            it ("Requires scope parameter", async () => {
                const clientId  = jwt.sign({ jwks: { keys: [ PUBLIC_KEY]}}, config.jwtSecret)
                const assertion = generateRegistrationToken({ clientId })
                const res       = await requestAccessToken(assertion, "")
                assert.equal(res.status, 400)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_request',
                    error_description: "Missing scope parameter"
                })
            })
            
            it ("Can negotiate scopes", async () => {
                const clientId  = jwt.sign({ jwks: { keys: [ PUBLIC_KEY]}}, config.jwtSecret)
                const assertion = generateRegistrationToken({ clientId })
                const res       = await requestAccessToken(assertion, "x y z")
                assert.equal(res.status, 403)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_scope',
                    error_description: 'No access could be granted for scopes "x y z".'
                })
            })
            
        })
    })
    
    // The patient resources submitted to the operation do not need to be
    // complete. Individual systems and use case specific implementation guides
    // MAY require data elements and/or specific identifier types be populated.
    // Note that the client should provide an id element for each Patient
    // resource that’s unique to a patient in the source system, since this id
    // will be returned as part of the response to enable tying the match bundles
    // to patients in the request.

    // The server MAY document a limit on the number of bytes or instances of
    // the resource parameter in a kickoff request. For requests larger than
    // this limit, a client can break the request into smaller requests and
    // submit them serially. See the Response - Error section below for more
    // details.

    describe("$bulk-match", () => {

        it ("Can simulate too_many_patient_params error", async () => {
            const clientId  = jwt.sign({
                jwks: { keys: [ PUBLIC_KEY ] },
                err: "too_many_patient_params"
            }, config.jwtSecret)
            const assertion = generateRegistrationToken({ clientId })
            const res = await requestAccessToken(assertion)
            const json = await res.json()
            const res2 = await fetch(`${baseUrl}/fhir/Patient/$bulk-match`, {
                method: "POST",
                headers: { authorization: `Bearer ${json.access_token}` }
            })
            const json2 = await res2.json()
            expectOperationOutcome(json2, {
                severity: 'error',
                code: 400,
                diagnostics: "Too many patient parameters (simulated error)"
            })
        })

        it ("Rejects invalid accept header", async () => {
            const res = await fetch(`${baseUrl}/fhir/Patient/$bulk-match`, {
                method: "POST",
                headers: { accept: "*/*" }
            })
            assert.equal(res.status, 400)
            const json = await res.json()
            expectOperationOutcome(json, {
                severity: 'error',
                code: 400,
                diagnostics: "If used, the accept header must be 'application/fhir+ndjson'"
            })
        })

        it ("Rejects invalid prefer header", async () => {
            const res = await fetch(`${baseUrl}/fhir/Patient/$bulk-match`, {
                method: "POST",
                headers: {
                    accept: "application/fhir+ndjson",
                    prefer: "test",
                }
            })
            assert.equal(res.status, 400)
            const json = await res.json()
            expectOperationOutcome(json, {
                severity: 'error',
                code: 400,
                diagnostics: "If used, the prefer header must be 'respond-async'"
            })
        })

        it ("Rejects missing parameters body", async () => {
            const res = await fetch(`${baseUrl}/fhir/Patient/$bulk-match`, {
                method: "POST",
                headers: { accept: "application/fhir+ndjson" }
            })
            assert.equal(res.status, 400)
            const json = await res.json()
            expectOperationOutcome(json, {
                severity: 'error',
                code: 400,
                diagnostics: "Invalid Parameters resource"
            })
        })

        it ("Rejects invalid parameters body", async () => {
            const res = await fetch(`${baseUrl}/fhir/Patient/$bulk-match`, {
                method: "POST",
                body: '{"parameter":3}',
                headers: { accept: "application/fhir+ndjson" }
            })
            assert.equal(res.status, 400)
            const json = await res.json()
            expectOperationOutcome(json, {
                severity: 'error',
                code: 400,
                diagnostics: "Invalid Parameters resource"
            })
        })

        it ("Rejects empty resource parameters", async () => {
            const res = await match(baseUrl)
            assert.equal(res.status, 400)
            const json = await res.json()
            expectOperationOutcome(json, {
                severity: 'error',
                code: 400,
                diagnostics: "At least one resource parameter must be provided"
            })
        })

        it ("Rejects too many resources", async () => {
            const originalLimit = config.resourceParameterLimit
            try {
                config.resourceParameterLimit = 2
                const res = await match(baseUrl, {
                    resource: [
                        { resourceType: "Patient", id: 1 },
                        { resourceType: "Patient", id: 2 },
                        { resourceType: "Patient", id: 3 },
                    ]
                })
                assert.equal(res.status, 413)
                const json = await res.json()
                expectOperationOutcome(json, {
                    severity: 'error',
                    code: 413,
                    diagnostics: /Cannot use more than 2 resource parameters/
                })
            } catch (ex) {
                throw ex
            } finally {
                config.resourceParameterLimit = originalLimit
            }
        })

        it ("Rejects invalid Patient resources", async () => {
            const res = await match(baseUrl, {
                resource: [ { resourceType: "X" } ]
            })
            assert.equal(res.status, 400)
            const json = await res.json()
            expectOperationOutcome(json, {
                severity: 'error',
                code: 400,
                diagnostics: "resource[0] does not appear to be a Patient resource"
            })
        })

        it ("Rejects Patient resources without IDs", async () => {
            const res = await match(baseUrl, {
                resource: [
                    { resourceType: "Patient", id: 1 },
                    { resourceType: "Patient" }
                ]
            })
            assert.equal(res.status, 400)
            const json = await res.json()
            expectOperationOutcome(json, {
                severity: 'error',
                code: 400,
                diagnostics: 'resource[1] is required to have an "id" attribute'
            })
        })

        it ("Validates the onlySingleMatch parameter", async () => {
            const res = await match(baseUrl, {
                resource: [{ resourceType: "Patient", id: 1 }],
                onlySingleMatch: null
            })
            assert.equal(res.status, 400)
            const json = await res.json()
            expectOperationOutcome(json, {
                severity: 'error',
                code: 400,
                diagnostics: 'Only boolean values are accepted for the onlySingleMatch parameter'
            })
        })
        
        it ("Validates the onlyCertainMatches parameter", async () => {
            const res = await match(baseUrl, {
                resource: [{ resourceType: "Patient", id: 1 }],
                onlyCertainMatches: null
            })
            assert.equal(res.status, 400)
            const json = await res.json()
            expectOperationOutcome(json, {
                severity: 'error',
                code: 400,
                diagnostics: 'Only boolean values are accepted for the onlyCertainMatches parameter'
            })
        })

        it ("Validates the count parameter", async () => {
            const res = await match(baseUrl, {
                resource: [{ resourceType: "Patient", id: 1 }],
                count: null
            })
            assert.equal(res.status, 400)
            const json = await res.json()
            expectOperationOutcome(json, {
                severity: 'error',
                code: 400,
                diagnostics: 'Only integers grater than 0 are accepted for the count parameter'
            })
        })

        it ("Validates the _outputFormat parameter", async () => {
            const res = await match(baseUrl, {
                resource: [{ resourceType: "Patient", id: 1 }],
                _outputFormat: null
            })
            assert.equal(res.status, 400)
            const json = await res.json()
            // assert.equal(json.statusCode, 400)
            // assert.equal(json.message, "If used, the _outputFormat parameter must be one of 'application/fhir+ndjson', 'application/ndjson' or 'ndjson'")
            expectOperationOutcome(json, {
                severity: 'error',
                code: 400,
                diagnostics: "If used, the _outputFormat parameter must be one of 'application/fhir+ndjson', 'application/ndjson' or 'ndjson'"
            })
        })

        it ("Works", async () => {
            const res = await match(baseUrl, {
                resource: [
                    { resourceType: "Patient", id: "#1" },
                    { resourceType: "Patient", id: "#2" },
                    { resourceType: "Patient", id: "#3" },
                ]
            })
            assert.equal(res.status, 202)
            // const json = await res.json()
            // assert.equal(json.statusCode, 200)
            // assert.equal(json.message, "If used, the _outputFormat parameter must be one of 'application/fhir+ndjson', 'application/ndjson' or 'ndjson'")
        })
    })

    describe("Check Status", () => {

        it ("Can simulate too_frequent_status_requests error", async () => {
            const clientId  = jwt.sign({
                jwks: { keys: [ PUBLIC_KEY ] },
                err: "too_frequent_status_requests"
            }, config.jwtSecret)
            const assertion = generateRegistrationToken({ clientId })
            const res = await requestAccessToken(assertion)
            const json = await res.json()
            const res2 = await fetch(`${baseUrl}/jobs/whatever/status`, {
                headers: { authorization: `Bearer ${json.access_token}` }
            })
            const json2 = await res2.json()
            assert.equal(res2.status, 429)
            expectOperationOutcome(json2, {
                severity: 'error',
                code: 429,
                diagnostics: "Too frequent status requests (simulated error)"
            })
        })

        it ("Rejects on missing jobs", async () => {
            const res = await fetch(`${baseUrl}/jobs/missingJob/status`)
            const txt = await res.text()
            assert.equal(res.status, 404)
            assert.match(txt, /Job not found/)
        })

        it ("Sets requiresAccessToken to true is kicked-off with auth", async () => {
            const clientId  = jwt.sign({ jwks: { keys: [ PUBLIC_KEY ] }}, config.jwtSecret)
            const assertion = generateRegistrationToken({ clientId })
            const res1      = await requestAccessToken(assertion)
            const { access_token } = await res1.json()
            
            const res2 = await match(baseUrl, {
                resource: [ { resourceType: "Patient", id: "#1" } ],
                headers: { authorization: `Bearer ${access_token}` }
            })

            assert.equal(res2.status, 202)
            const statusUrl = res2.headers.get("content-location")
            await wait(config.jobThrottle * 2 + 10 - config.throttle)
            const res3 = await fetch(statusUrl + "")
            assert.equal(res3.status, 200)
            const json = await res3.json()
            // console.log(json)
            assert.equal(json.requiresAccessToken, true)
        })

        it ("Works", async () => {

            const origRetryAfter = config.retryAfter
            try {
                config.retryAfter = 100
                const startDate = moment()

                const res = await match(baseUrl, {
                    resource: [
                        { resourceType: "Patient", id: "#1" },
                        { resourceType: "Patient", id: "#2" },
                        { resourceType: "Patient", id: "#3" },
                    ]
                })

                assert.equal(res.status, 202)

                const statusUrl = res.headers.get("content-location")

                const res2 = await fetch(statusUrl + "")
                assert.equal(res2.status, 202)
                assert.equal(res2.headers.get("x-progress"), "0% complete")
                assert.equal(res2.headers.get("retry-after"), "1")

                await wait(config.jobThrottle + 10 - config.throttle)

                const res3 = await fetch(statusUrl + "")
                assert.equal(res3.status, 202)
                assert.equal(res3.headers.get("x-progress"), "33% complete")
                assert.equal(res3.headers.get("retry-after"), "1")

                await wait(config.jobThrottle + 10 - config.throttle)

                const res4 = await fetch(statusUrl + "")
                assert.equal(res4.status, 202)
                assert.equal(res4.headers.get("x-progress"), "66% complete")
                assert.equal(res4.headers.get("retry-after"), "1")

                await wait(config.jobThrottle + 10 - config.throttle)

                const res5 = await fetch(statusUrl + "")
                assert.equal(res5.status, 200)
                const json = await res5.json()
                
                assert.ok(moment(json.transactionTime).isSame(startDate, "minute"))
                assert.equal(json.request, `${baseUrl}/fhir/Patient/$bulk-match`)
                assert.equal(json.requiresAccessToken, false)
                assert.deepEqual(json.error, [])
                assert.ok(Array.isArray(json.output))
            } finally {
                config.retryAfter = origRetryAfter
            }
        })
    })

    describe("Download a file", () => {

        it ("Can simulate file_not_found error", async () => {
            const clientId  = jwt.sign({
                jwks: { keys: [ PUBLIC_KEY ] },
                err: "file_not_found"
            }, config.jwtSecret)
            const assertion = generateRegistrationToken({ clientId })
            const res = await requestAccessToken(assertion)
            const json = await res.json()
            const res2 = await fetch(`${baseUrl}/jobs/whatever/files/whatever`, {
                headers: { authorization: `Bearer ${json.access_token}` }
            })
            const json2 = await res2.json()
            expectOperationOutcome(json2, {
                severity: 'error',
                code: 404,
                diagnostics: "File not found (simulated error)"
            })
        })

        it ("Rejects on missing jobs", async () => {
            const res = await fetch(`${baseUrl}/jobs/missingJob/files/missingFile`)
            const txt = await res.text()
            assert.equal(res.status, 404)
            assert.match(txt, /Export job not found/)
        })

        it ("Rejects on missing files", async () => {
            const res       = await match(baseUrl, { resource: [ { resourceType: "Patient", id: "#1" } ] })
            const statusUrl = res.headers.get("content-location") + ""
            const jobId     = statusUrl.match(/\/jobs\/(.+?)\/status$/)?.[1]
            await wait(200)
            const res2 = await fetch(`${baseUrl}/jobs/${jobId}/files/missingFile`)
            const txt = await res2.text()
            assert.equal(res2.status, 404)
            assert.match(txt, /File not found/)
        })

        it ("Works", async () => {
            const res = await match(baseUrl, {
                resource: [
                    {
                        "resourceType": "Patient",
                        "id": "123",
                        "birthDate": "2023-10-11",
                        "name": [
                            {
                                "family": "Pfannerstill",
                                "given" : ["Samuel","Rosalina"]
                            }
                        ]
                    }
                ]
            })

            assert.equal(res.status, 202)
            const statusUrl = res.headers.get("content-location")
            await wait(config.retryAfter - config.throttle)
            const manifest = await (await fetch(statusUrl + "")).json()

            assert.equal(manifest.output.length, 1)
            assert.equal(manifest.output[0].type, "Bundle")
            assert.equal(manifest.output[0].count, 1)
            assert.ok(manifest.output[0].url.startsWith(`${baseUrl}/jobs/`))

            const fileResponse = await fetch(manifest.output[0].url)

            assert.equal(fileResponse.headers.get("content-type"), "application/fhir+ndjson")
            assert.equal(fileResponse.headers.get("content-disposition"), "attachment")
            assert.equal(fileResponse.headers.get("connection"), "close")

            const bundle = await fileResponse.json()
            assert.ok(bundle.entry.length > 0)
        })
    })

    describe("List all jobs", () => {
        it ("Works", async () => {
            const res = await fetch(`${baseUrl}/jobs`)
            const json = await res.json()
            assert.ok(Array.isArray(json))
        })
    })

    describe("Get one job", () => {
        it ("Works", async () => {
            const res       = await match(baseUrl, { resource: [ { resourceType: "Patient", id: "#1" } ] })
            const statusUrl = res.headers.get("content-location") + ""
            const jobId     = statusUrl.match(/\/jobs\/(.+?)\/status$/)?.[1]
            const res2 = await fetch(`${baseUrl}/jobs/${jobId}`)
            const json = await res2.json()
            assert.equal(json.id, jobId)
        })
    })

    describe("Abort jobs", () => {
        it ("Works", async () => {
            // After a Bulk Match request has been started, a client MAY send a
            // DELETE request to the URL provided in the Content-Location header
            // to cancel the request as described in the FHIR Asynchronous Bulk
            // Data Request Pattern. If the request has been completed, a server
            // MAY use the request as a signal that a client is done retrieving
            // files and that it is safe for the sever to remove those from
            // storage.
            const res       = await match(baseUrl, { resource: [ { resourceType: "Patient", id: "#1" } ] })
            const statusUrl = res.headers.get("content-location") + ""
            const res2      = await fetch(statusUrl, { method: "DELETE" })
            const txt       = await res2.text()
            assert.equal(res2.status, 202)
            assert.match(txt, /Job deleted/)
            
            // Following the delete request, when subsequent requests are made
            // to the polling location, the server SHALL return a 404 Not Found
            // error and an associated FHIR OperationOutcome in JSON format.
            const res3      = await fetch(statusUrl, { method: "DELETE" })
            const txt3      = await res3.text()
            assert.equal(res3.status, 404)
            assert.match(txt3, /Job not found/)
        })
    })

    it ("Get all patients", async () => {
        const res = await fetch(`${baseUrl}/fhir/Patient`)
        assert.equal(res.status, 200)
        assert.match(res.headers.get("content-type")!, /\bjson\b/)
    })

    it ("Get patient by id", async () => {
        const res = await fetch(`${baseUrl}/fhir/Patient/${patients[0].id}`)
        assert.equal(res.status, 200)
        assert.match(res.headers.get("content-type")!, /\bjson\b/)
    })

    it ("Get patient by id rejects missing IDs", async () => {
        const res = await fetch(`${baseUrl}/fhir/Patient/whatever`)
        assert.equal(res.status, 404)
    })
})

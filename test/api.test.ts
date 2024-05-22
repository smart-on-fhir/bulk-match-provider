import { randomBytes }      from "crypto"
import { Server }           from "http"
import assert               from "node:assert/strict"
import jwt, { SignOptions } from "jsonwebtoken"
import jwkToPem             from "jwk-to-pem"
import moment               from "moment"
import { Bundle }           from "fhir/r4"
import { faker }            from "@faker-js/faker"
import run                  from "../src/index"
import config               from "../src/config"
import { wait }             from "../src/lib"
import patients             from "../src/patients"
import MockServer           from "./MockServer"
import app                  from ".."
import BulkMatchClient      from "./BulkMatchClient"
import Job                  from "../src/Job"
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


function expectOperationOutcome(json: any, {
    severity,
    code,
    diagnostics
}: {
    severity?: string
    code?: number | string
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

async function expectResult(client: BulkMatchClient, {
    numberOfFiles,
    numberOfBundles,
    numberOfMatches = [],
    percentFakeMatches,
    percentFakeDuplicates
} : {
    numberOfFiles        ?: number
    numberOfBundles      ?: number
    numberOfMatches      ?: number[]
    percentFakeMatches   ?: number
    percentFakeDuplicates?: number
}) {
    const manifest = await client.waitForCompletion()

    // console.log("manifest ======>", manifest)

    if (numberOfFiles || numberOfFiles === 0) {
        assert.equal(
            manifest.output.length,
            numberOfFiles,
            `Expected ${numberOfFiles} files`
        )
    }

    if (percentFakeMatches) {
        assert.equal(
            manifest.extension?.percentFakeMatches,
            percentFakeMatches,
            "Expected the manifest to include percentFakeMatches extension"
        )
    }

    if (percentFakeDuplicates) {
        assert.equal(
            manifest.extension?.percentFakeDuplicates,
            percentFakeDuplicates,
            "Expected the manifest to include percentFakeDuplicates extension"
        )
    }

    let i = 0
    let nBundles = 0
    for (const entry of manifest.output) {
        // console.log("manifest.output entry ======>", entry)
        assert.equal(entry.type, "Bundle")
        assert.equal(typeof entry.count, "number")
        assert.equal(typeof entry.url, "string")

        const data  = await client.download(i)
        const lines = data.split(/\n/).filter(Boolean)

        assert.equal(entry.count, lines.length, "entry.count must equal the number of ndjson lines")
        // console.log(lines)
        lines.forEach((line, y) => {
            let bundle: Bundle;
            assert.doesNotThrow(() => bundle = JSON.parse(line), `Line ${y + 1} of file ${i + 1} could not be parsed as JSON`)
            // console.log(bundle!)
            assert.equal(bundle!.resourceType, "Bundle")
            assert.equal(bundle!.type, "searchset")
            if (numberOfMatches[nBundles] || numberOfMatches[nBundles] === 0) {
                assert.equal(
                    bundle!.total,
                    numberOfMatches[nBundles],
                    `Expected bundle number ${nBundles + 1} to have 'total' of ${
                    numberOfMatches[nBundles]} results but found ${bundle!.total}! Bundle:\n${JSON.stringify(bundle!, null, 4)}`
                )
            }
            nBundles++
        })

        i++
    }

    if (numberOfBundles) {
        assert.equal(
            nBundles,
            numberOfBundles,
            `Expected total of ${numberOfBundles} bundles across all files bunt got ${nBundles}`
        )
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

    function requestAccessToken(token: string, scope = "system/Patient.rs") {
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
                        fakeMatches         : "33",
                        duplicates          : "44",
                        err                 : "my-err",
                        matchServer         : "http://whatever.dev",
                        proxyClientId       : "proxy-client-id",
                        proxyScope          : "proxy-scope",
                        proxyJWK            : '{"a":3}'
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
                assert.equal(token.matchServer, "http://whatever.dev")
                assert.equal(token.proxyClientId, "proxy-client-id")
                assert.equal(token.proxyScope, "proxy-scope")
                assert.deepEqual(token.proxyJWK, {"a":3})
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
                assert.equal(res.status, 401)
                const json = await res.json()
                expectOAuthError(json, {
                    error: 'invalid_client',
                    error_description: "Registration token expired (simulated error)"
                })
            })

            it ("Can simulate reg_invalid_scope error", async () => {
                const clientId  = jwt.sign({ err: "reg_invalid_scope" }, config.jwtSecret)
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

        describe("checkAuth", () => {

            async function tryAccess(client: object) {
                const clientId = jwt.sign(client, config.jwtSecret)
                const assertion = generateRegistrationToken({ clientId })
                const res1 = await requestAccessToken(assertion, "system/Patient.rs")
                const json = await res1.json()
                return await fetch(`${baseUrl}/jobs/whatever/status`, {
                    headers: { authorization: `Bearer ${ json.access_token }` }
                })
            }

            it ("Simulated expired_access_token error", async () => {
                const res = await tryAccess({ jwks: { keys: [ PUBLIC_KEY ] }, err: "expired_access_token" })
                assert.equal(res.status, 401)
                const json = await res.json()
                expectOAuthError(json, { error: "invalid_client", error_description: "Access token expired (simulated error)" })
            })

            it ("Simulated invalid_access_token error", async () => {
                const res = await tryAccess({ jwks: { keys: [ PUBLIC_KEY ] }, err: "invalid_access_token" })
                assert.equal(res.status, 401)
                const json = await res.json()
                expectOAuthError(json, { error: "invalid_client", error_description: "Invalid access token (simulated error)" })
            })
            
            it ("Simulated invalid_scope error", async () => {
                const res = await tryAccess({ jwks: { keys: [ PUBLIC_KEY ] }, err: "invalid_scope" })
                assert.equal(res.status, 403)
                const json = await res.json()
                expectOAuthError(json, { error: "invalid_scope", error_description: "Invalid scope (simulated error)" })
            })

            it ("Simulated unauthorized_client error", async () => {
                const res = await tryAccess({ jwks: { keys: [ PUBLIC_KEY ] }, err: "unauthorized_client" })
                assert.equal(res.status, 403)
                const json = await res.json()
                expectOAuthError(json, { error: "unauthorized_client", error_description: "Unauthorized client (simulated error)" })
            })

            it ("Simulated expired_registration_token error", async () => {
                const clientId = jwt.sign({ jwks: { keys: [ PUBLIC_KEY ] }, err: "expired_registration_token" }, config.jwtSecret)
                const assertion = generateRegistrationToken({ clientId })
                const res = await requestAccessToken(assertion, "system/Patient.rs")
                const json = await res.json()
                assert.equal(res.status, 401)
                expectOAuthError(json, { error: "invalid_client", error_description: "Registration token expired (simulated error)" })
            })

            it ("Simulated invalid_client error", async () => {
                const clientId = jwt.sign({ jwks: { keys: [ PUBLIC_KEY ] }, err: "invalid_client" }, config.jwtSecret)
                const assertion = generateRegistrationToken({ clientId })
                const res = await requestAccessToken(assertion, "system/Patient.rs")
                const json = await res.json()
                assert.equal(res.status, 401)
                expectOAuthError(json, { error: "invalid_client", error_description: "Invalid client (simulated error)" })
            })

            it ("Simulated reg_invalid_scope error", async () => {
                const clientId = jwt.sign({ jwks: { keys: [ PUBLIC_KEY ] }, err: "reg_invalid_scope" }, config.jwtSecret)
                const assertion = generateRegistrationToken({ clientId })
                const res = await requestAccessToken(assertion, "system/Patient.rs")
                assert.equal(res.status, 403)
                const json = await res.json()
                expectOAuthError(json, { error: "invalid_scope", error_description: "Invalid scope (simulated error)" })
            })

            it ("Catches invalid token errors", async () => {
                const res = await fetch(`${baseUrl}/jobs/whatever/status`, { headers: { authorization: `Bearer whatever` }})
                assert.equal(res.status, 401)
                const json = await res.json()
                expectOperationOutcome(json, { severity: "error", code: 401, diagnostics: /^Invalid token\b/ })
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

    describe("$bulk-match", function() {
        this.timeout(15000)

        it ("Can simulate too_many_patient_params error", async () => {
            const clientId  = BulkMatchClient.register({
                jwks: { keys: [ PUBLIC_KEY ] },
                err: "too_many_patient_params"
            })
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
            const client = new BulkMatchClient({ baseUrl })
            const res = await client.kickOff({ resource: [] })
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
                const client = new BulkMatchClient({ baseUrl })
                const res = await client.kickOff({
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
            const client = new BulkMatchClient({ baseUrl })
            const res = await client.kickOff({
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
            const client = new BulkMatchClient({ baseUrl })
            const res = await client.kickOff({
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
            const client = new BulkMatchClient({ baseUrl })
            const res = await client.kickOff({
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
            const client = new BulkMatchClient({ baseUrl })
            const res = await client.kickOff({
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
            const client = new BulkMatchClient({ baseUrl })
            const res = await client.kickOff({
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
            const client = new BulkMatchClient({ baseUrl })
            const res = await client.kickOff({
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

        it ("Rejects percentFakeMatches with zero input patients", async () => {
            const clientId  = BulkMatchClient.register({ jwks: { keys: [ PUBLIC_KEY] }, fakeMatches: 60 })
            const assertion = generateRegistrationToken({ clientId })
            const res1      = await requestAccessToken(assertion)
            const json1     = await res1.json()
            const client    = new BulkMatchClient({ baseUrl, accessToken: json1.access_token })
            const res       = await client.kickOff({ resource: [] })
            expectOperationOutcome(await res.json(), {
                severity: 'error',
                code: 400,
                diagnostics: "At least one resource parameter must be provided"
            })
        })

        it ("percentFakeMatches", async () => {
            const clientId  = BulkMatchClient.register({ jwks: { keys: [ PUBLIC_KEY] }, fakeMatches: 70 })
            const assertion = generateRegistrationToken({ clientId })
            const res1      = await requestAccessToken(assertion)
            const json1     = await res1.json()
            const client    = new BulkMatchClient({
                baseUrl,
                accessToken: json1.access_token
            })

            await client.kickOff({
                resource: [
                    { resourceType: "Patient", id: "#1", name: [{ family: "Patient 1 Name" }] },
                    { resourceType: "Patient", id: "#2", name: [{ family: "Patient 2 Name" }] },
                    { resourceType: "Patient", id: "#3", name: [{ family: "Patient 3 Name" }] },
                ]
            })

            await expectResult(client, {
                numberOfFiles     : 2,
                numberOfBundles   : 3,
                percentFakeMatches: 70,
                numberOfMatches   : [1, 1, 0]
            })
        })

        it ("percentFakeMatches + count", async () => {
            const clientId  = BulkMatchClient.register({
                jwks: { keys: [ PUBLIC_KEY] },
                fakeMatches: 100,
                duplicates: 100
            })
            const assertion = generateRegistrationToken({ clientId })
            const res1      = await requestAccessToken(assertion)
            const json1     = await res1.json()
            const client    = new BulkMatchClient({
                baseUrl,
                accessToken: json1.access_token
            })

            await client.kickOff({
                resource: [
                    { resourceType: "Patient", id: "#1", name: [{ family: "Patient 1 Name" }] },
                    { resourceType: "Patient", id: "#2", name: [{ family: "Patient 2 Name" }] },
                    { resourceType: "Patient", id: "#3", name: [{ family: "Patient 3 Name" }] },
                ],
                count: 2
            })

            await expectResult(client, {
                numberOfFiles        : 2,
                numberOfBundles      : 3,
                percentFakeDuplicates: 100,
                percentFakeMatches   : 100,
                numberOfMatches      : [2, 2, 2]
            })
        })

        it ("percentFakeMatches producing 0 results", async () => {
            const clientId  = BulkMatchClient.register({ jwks: { keys: [ PUBLIC_KEY] }, fakeMatches: 10 })
            const assertion = generateRegistrationToken({ clientId })
            const res1      = await requestAccessToken(assertion)
            const json1     = await res1.json()
            const client    = new BulkMatchClient({
                baseUrl,
                accessToken: json1.access_token
            })

            await client.kickOff({
                resource: [
                    { resourceType: "Patient", id: "#1" },
                    { resourceType: "Patient", id: "#2" },
                    { resourceType: "Patient", id: "#3" },
                ]
            })

            await expectResult(client, {
                numberOfFiles        : 2,
                numberOfBundles      : 0,
                percentFakeMatches   : 10
            })
        })

        it ("percentFakeDuplicates", async () => {
            const clientId  = BulkMatchClient.register({
                jwks: {
                    keys: [ PUBLIC_KEY]
                },
                fakeMatches: 100,
                duplicates : 90
            })
            const assertion = generateRegistrationToken({ clientId })
            const res1      = await requestAccessToken(assertion)
            const json1     = await res1.json()
            const client    = new BulkMatchClient({
                baseUrl,
                accessToken: json1.access_token
            })

            await client.kickOff({
                resource: [
                    { resourceType: "Patient", id: "1", name: [{ family: "Patient 1 Name" }] },
                    { resourceType: "Patient", id: "2", name: [{ family: "Patient 2 Name" }] },
                    { resourceType: "Patient", id: "3", name: [{ family: "Patient 3 Name" }] },
                ]
            })

            await expectResult(client, {
                numberOfFiles        : 2,
                numberOfBundles      : 3,
                percentFakeMatches   : 100,
                percentFakeDuplicates: 90,
                numberOfMatches      : [2,2,2]
            })
        })

        it ("Works", async () => {
            const client = new BulkMatchClient({ baseUrl })
            const res = await client.kickOff({
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

        it ("onlySingleMatch - when possible", async () => {
            
            const client = new BulkMatchClient({ baseUrl })
            
            // We have multiple records for patients with such name and DOB, but
            // with different phones. Normally we should get back all matches,
            // but if onlySingleMatch is true we should only get the one with
            // the matching phone
            await client.kickOff({
                resource: [
                    {
                        resourceType:"Patient",
                        id:"1",
                        name:[
                            {
                                family:"Frami",
                                given:["Valentine","Ahmed"]
                            }
                        ],
                        telecom:[
                            {
                                system:"phone",
                                value:"555-790-7955",
                                use:"home"
                            }
                        ],
                        birthDate:"2020-07-17"
                    }
                ],
                onlySingleMatch: true
            })

            await client.waitForCompletion()
            assert.equal(client.manifest.output.length, 1)
            assert.equal(client.manifest.output[0].count, 1)
            const ndjson = await client.download(0)
            const bundle = JSON.parse(ndjson.split(/\n/)[0])
            assert.equal(bundle.entry[0].resource.telecom[0].value, "555-790-7955")
        })

        it ("onlySingleMatch - when not possible", async () => {
            const client = new BulkMatchClient({ baseUrl })
            
            // We have 2 records for patients with such name and DOB, but with
            // different phones. Normally we should get back 2 matches, but if
            // onlySingleMatch if true we should only get none because the
            // server cannot decide which match is better. This test is very
            // similar to the one above but we omit the telecom sections here
            // to make sure that the 2 matches will end up having the same
            // score (and therefore none can be chosen).
            await client.kickOff({
                resource: [
                    {
                        resourceType:"Patient",
                        id:"1",
                        name:[
                            {
                                family:"Frami",
                                given:["Valentine","Ahmed"]
                            }
                        ],
                        birthDate:"2020-07-17"
                    }
                ],
                onlySingleMatch: true
            })

            await client.waitForCompletion()
            assert.equal(client.manifest.output.length, 1)
            const count = client.manifest.output[0].count
            assert.ok(count === 0 || count === 1)
            if (count === 1) {
                const ndjson = await client.download(0)
                const bundle = JSON.parse(ndjson.split(/\n/)[0])
                assert.equal(bundle.total, 0)
                assert.deepEqual(bundle.entry, [])
            }
        })

        it ("onlySingleMatch + fakeMatches = pick the first input patient", async () => {
            const client = new BulkMatchClient({
                baseUrl,
                privateKey: PRIVATE_KEY,
                registrationOptions: {
                    jwks: { keys: [ PUBLIC_KEY ] },
                    fakeMatches: 67
                }
            })
            
            await client.kickOff({
                resource: [
                    {
                        "resourceType": "Patient",
                        "id": "1",
                        "name":[{"family":"A","given":["B","C"]}]
                    },
                    {
                        "resourceType": "Patient",
                        "id": "2",
                        "name":[{"family":"B","given":["C","D"]}]
                    },
                    {
                        "resourceType": "Patient",
                        "id": "3",
                        "name":[{"family":"C","given":["D","E"]}]
                    }
                ],
                onlySingleMatch: true
            })

            await expectResult(client, {
                numberOfFiles        : 2,
                numberOfBundles      : 3,
                percentFakeMatches   : 67,
                numberOfMatches      : [1,1,0]
            })
        })

        it ("onlyCertainMatches", async () => {
            const client = new BulkMatchClient({ baseUrl })
            
            await client.kickOff({
                resource: [
                    {
                        resourceType:"Patient",
                        id:"1",
                        name:[ { family:"Frami", given:["Valentine","Ahmed"] } ],
                        birthDate:"2020-07-17"
                    }
                ],
                onlyCertainMatches: true
            })

            // We have 3 patients with this name and DOB, but only 2 of them share
            // the same SSN and MRN, therefore onlyCertainMatches should reduce
            // our results to 2 matches into 1 bundle
            await expectResult(client, {
                numberOfFiles  : 1,
                numberOfBundles: 1,
                numberOfMatches: [2],
            })
        })

        it ("onlyCertainMatches + onlySingleMatch when possible", async () => {
            const client = new BulkMatchClient({ baseUrl })
            
            await client.kickOff({
                resource: [
                    {
                        resourceType:"Patient",
                        id:"1",
                        name:[ { family:"Frami", given:["Valentine","Ahmed"] } ],
                        birthDate:"2020-07-17",
                        telecom:[{ system:"phone", value:"555-790-7956" }]
                    }
                ],
                onlySingleMatch: true,
                onlyCertainMatches: true
            })

            await client.waitForCompletion()
            assert.equal(client.manifest.output.length, 1)
            assert.equal(client.manifest.output[0].count, 1)
        })

        it ("onlyCertainMatches + onlySingleMatch when not possible", async () => {
            const client = new BulkMatchClient({ baseUrl })
            
            await client.kickOff({
                resource: [
                    {
                        resourceType:"Patient",
                        id:"1",
                        name:[ { family:"Frami", given:["Valentine","Ahmed"] } ],
                        birthDate:"2020-07-17"
                    }
                ],
                onlySingleMatch: true,
                onlyCertainMatches: true
            })

            await expectResult(client, {
                numberOfFiles  : 1,
                numberOfBundles: 1,
                numberOfMatches: [0],
            })
        })

        it ("rejects if to many jobs are currently running", async () => {
            const { maxRunningJobs, jobThrottle } = config
            try {
                config.maxRunningJobs = 1
                config.jobThrottle    = 300
                const client = new BulkMatchClient({ baseUrl })
                
                const { status: status1 } = await client.kickOff({
                    resource: [
                        { resourceType: "Patient", id: "1" },
                        { resourceType: "Patient", id: "2" }
                    ]
                })
                assert.equal(Job.countRunningJobs(), 1, "After the first job is started expect a total of 1 jobs running")
                assert.equal(status1, 202)

                const { status: status2 } = await client.kickOff({
                    resource: [
                        { resourceType: "Patient", id: "1" },
                        { resourceType: "Patient", id: "2" }
                    ]
                })
                assert.equal(Job.countRunningJobs(), 1, "After the second job is started expect a total of 1 jobs running")
                assert.equal(status2, 429)
            } finally {
                config.maxRunningJobs = maxRunningJobs
                config.jobThrottle    = jobThrottle
            }
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

        it ("Can simulate transient_status_error error", async () => {
            const clientId  = jwt.sign({ jwks: { keys: [ PUBLIC_KEY ] }, err: "transient_status_error" }, config.jwtSecret)
            const assertion = generateRegistrationToken({ clientId })
            const res  = await requestAccessToken(assertion)
            const json = await res.json()
            const res2 = await fetch(`${baseUrl}/jobs/whatever/status`, {
                headers: { authorization: `Bearer ${json.access_token}` }
            })
            const json2 = await res2.json()
            assert.equal(res2.status, 500)
            expectOperationOutcome(json2, {
                severity   : "error",
                code       : "transient",
                diagnostics: "The job is currently failing but you can still retry later (simulated error)"
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
            
            const client = new BulkMatchClient({ baseUrl })
            const res2 = await client.kickOff({
                resource: [ { resourceType: "Patient", id: "#1" } ],
                headers: { authorization: `Bearer ${access_token}` }
            })

            assert.equal(res2.status, 202)
            await wait(config.jobThrottle * 2 + 10 - config.throttle)
            const res3 = await fetch(client.statusLocation)
            assert.equal(res3.status, 200)
            const json = await res3.json()
            // console.log(json)
            assert.equal(json.requiresAccessToken, true)
        })

        it ("Protects against too frequent requests", async () => {
            const { retryAfter, throttle } = config
            config.retryAfter = 1600
            config.throttle   = 100
            try {
                const client = new BulkMatchClient({ baseUrl })
                await client.kickOff({
                    resource: [
                        { resourceType: "Patient", id: "#1" },
                        { resourceType: "Patient", id: "#2" },
                        { resourceType: "Patient", id: "#3" },
                    ]
                })
                await assert.rejects(
                    client.waitForCompletion(100, true),
                    /Too many requests made/
                )
            } catch (ex) {
                throw ex
            } finally {
                config.retryAfter = retryAfter
                config.throttle   = throttle
            }
        })

        it ("Terminates the session after too many requests", async () => {
            const { retryAfter, throttle } = config
            config.retryAfter = 2000
            config.throttle   = 10
            try {
                const client = new BulkMatchClient({ baseUrl })
                await client.kickOff({
                    resource: [
                        { resourceType: "Patient", id: "#1" },
                        { resourceType: "Patient", id: "#2" },
                        { resourceType: "Patient", id: "#3" },
                        { resourceType: "Patient", id: "#4" },
                        { resourceType: "Patient", id: "#5" },
                        { resourceType: "Patient", id: "#6" },
                        { resourceType: "Patient", id: "#7" },
                        { resourceType: "Patient", id: "#8" },
                        { resourceType: "Patient", id: "#9" },
                        { resourceType: "Patient", id: "#10" },
                        { resourceType: "Patient", id: "#11" }
                    ]
                })
                await assert.rejects(client.waitForCompletion(10), /Session terminated/)
            } catch (ex) {
                throw ex
            } finally {
                config.retryAfter = retryAfter
                config.throttle   = throttle
            }
        })

        it ("Works", async () => {

            const origRetryAfter = config.retryAfter
            try {
                config.retryAfter = 100
                const startDate = moment()

                const client = new BulkMatchClient({ baseUrl })
                const res = await client.kickOff({
                    resource: [
                        { resourceType: "Patient", id: "#1" },
                        { resourceType: "Patient", id: "#2" },
                        { resourceType: "Patient", id: "#3" },
                    ]
                })

                assert.equal(res.status, 202)

                const res2 = await fetch(client.statusLocation)
                assert.equal(res2.status, 202)
                assert.equal(res2.headers.get("x-progress"), "33% complete")
                assert.equal(res2.headers.get("retry-after"), "1")

                await wait(config.jobThrottle + 110 - config.throttle)

                const res4 = await fetch(client.statusLocation)
                assert.equal(res4.status, 202)
                assert.equal(res4.headers.get("x-progress"), "66% complete")
                assert.equal(res4.headers.get("retry-after"), "1")

                await wait(config.jobThrottle + 110 - config.throttle)

                const res5 = await fetch(client.statusLocation)
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
            const client = new BulkMatchClient({ baseUrl })
            const res = await client.kickOff({
                resource: [ { resourceType: "Patient", id: "#1" } ]
            })
            await wait(200)
            const res2 = await fetch(`${baseUrl}/jobs/${client.jobId}/files/missingFile`)
            const txt = await res2.text()
            assert.equal(res2.status, 404)
            assert.match(txt, /File not found/)
        })

        it ("Requires auth if requiresAccessToken is true in the manifest", async () => {
            const clientId  = jwt.sign({ jwks: { keys: [ PUBLIC_KEY ] }}, config.jwtSecret)
            const assertion = generateRegistrationToken({ clientId })
            const res       = await requestAccessToken(assertion)
            const json      = await res.json()
            const client    = new BulkMatchClient({ baseUrl })
            const res2      = await client.kickOff({
                resource: [ { resourceType: "Patient", id: "#1" } ],
                headers : { authorization: `Bearer ${json.access_token}` }
            })
            const res3      = await fetch(`${baseUrl}/jobs/${client.jobId}/files/whatever`)
            const json3     = await res3.json()

            expectOperationOutcome(json3, {
                severity: 'error',
                code: 401,
                diagnostics: "Authentication is required for downloading these resources"
            })
        })

        it ("Works", async () => {
            const client = new BulkMatchClient({ baseUrl })
            await client.kickOff({
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

            await client.waitForCompletion()

            const manifest = client.manifest

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

    it ("Can limit results using the count parameter", async () => {
        const client = new BulkMatchClient({ baseUrl })
        await client.kickOff({
            resource: [
                {
                    "resourceType": "Patient",
                    "id": "123",
                    "birthDate": "2020-07-17",
                    "name":[{"family":"Frami","given":["Valentine","Ahmed"]}]
                }
            ],
            count: 1
        })
        await client.waitForCompletion()

        const manifest = client.manifest

        // console.log(manifest)

        assert.equal(manifest.output.length, 1)
        assert.equal(manifest.output[0].type, "Bundle")
        assert.equal(manifest.output[0].count, 1)
    })

    it ("Can limit results using the count parameter while using fake matches", async () => {
        // const clientId  = jwt.sign({ jwks: { keys: [ PUBLIC_KEY ], fakeMatches: 60 }}, config.jwtSecret)
        // const assertion = generateRegistrationToken({ clientId })
        // const res       = await requestAccessToken(assertion)
        const client    = new BulkMatchClient({
            baseUrl,
            privateKey: PRIVATE_KEY,
            registrationOptions: {
                jwks: { keys: [ PUBLIC_KEY ] },
                fakeMatches: 67
            }
        })
        await client.kickOff({
            resource: [
                {
                    "resourceType": "Patient",
                    "id": "1",
                    "name":[{"family":"A","given":["B","C"]}]
                },
                {
                    "resourceType": "Patient",
                    "id": "2",
                    "name":[{"family":"B","given":["C","D"]}]
                },
                {
                    "resourceType": "Patient",
                    "id": "3",
                    "name":[{"family":"C","given":["D","E"]}]
                }
            ],
            // count: 2,
        })
        await client.waitForCompletion()

        const manifest = client.manifest

        // console.log(manifest)

        assert.equal(manifest.output.length, 2)
        // assert.equal(manifest.output[0].type, "Bundle")
        // assert.equal(manifest.output[0].count, 2)
    })

    describe("List all jobs", () => {
        it ("Works", async () => {
            const res = await fetch(`${baseUrl}/jobs`)
            const json = await res.json()
            assert.ok(Array.isArray(json))
        })
    })

    it (".well-known/smart-configuration", async () => {
        const res = await fetch(`${baseUrl}/fhir/.well-known/smart-configuration`)
        const json = await res.json()
        assert.equal(json.token_endpoint        , `${baseUrl}/auth/token`   )
        assert.equal(json.registration_endpoint , `${baseUrl}/auth/register`)
    })

    it ("Can GET /config", async () => {
        const res = await fetch(`${baseUrl}/config`)
        const json = await res.json()
        assert.ok("supportedAlgorithms" in json)
        assert.ok("jobMaxLifetimeMinutes" in json)
        assert.ok("completedJobLifetimeMinutes" in json)
        assert.ok("resourceParameterLimit" in json)
    })

    it ("Can download patients", async () => {
        const res = await fetch(`${baseUrl}/patients`)
        assert.equal(res.headers.get("content-type"), "application/octet-stream")
    })

    it ("404 errors", async () => {
        const res = await fetch(`${baseUrl}/missing-path`)
        const json = await res.json()
        assert.deepEqual(json, { name: 'NotFound', message: 'Not Found', statusCode: 404, http: true })
    })

    it ("Get the UI at /", async () => {
        const res = await fetch(`${baseUrl}/`)
        const txt = await res.text()
        assert.ok(txt.startsWith("<!DOCTYPE html>"))
    })

    it ("Get the UI at /index.html", async () => {
        const res = await fetch(`${baseUrl}/index.html`)
        const txt = await res.text()
        assert.ok(txt.startsWith("<!DOCTYPE html>"))
    })

    it ("Custom throttle", async () => {
        const orig = config.throttle
        config.throttle = orig + 100
        try {
            const start = Date.now()
            await fetch(`${baseUrl}/config`)
            const dur = Date.now() - start
            assert.ok(dur >= config.throttle)
            assert.ok(dur <= config.throttle + 50)
        } finally {
            config.throttle = orig
        }
    })

    it ("Get one job", async () => {
        const client    = new BulkMatchClient({ baseUrl })
        await client.kickOff({ resource: [ { resourceType: "Patient", id: "#1" } ] })
        const res2 = await fetch(`${baseUrl}/jobs/${client.jobId}`)
        const json = await res2.json()
        assert.equal(json.id, client.jobId)
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
            const client    = new BulkMatchClient({ baseUrl })
            const res       = await client.kickOff({ resource: [ { resourceType: "Patient", id: "#1" } ] })
            const res2      = await client.cancel()
            const txt       = await res2.text()
            assert.equal(res2.status, 202)
            assert.match(txt, /Job deleted/)
            
            // Following the delete request, when subsequent requests are made
            // to the polling location, the server SHALL return a 404 Not Found
            // error and an associated FHIR OperationOutcome in JSON format.
            const res3      = await client.cancel()
            const txt3      = await res3.text()
            assert.equal(res3.status, 404)
            assert.match(txt3, /Job not found/)
        })
    })

    it ("OperationDefinition/bulk-match", async () => {
        const res = await fetch(`${baseUrl}/fhir/OperationDefinition/bulk-match`)
        assert.equal(res.status, 200)
        assert.match(res.headers.get("content-type")!, /\bjson\b/)
    })

    it ("/env", async () => {
        const res = await fetch(`${baseUrl}/env`)
        assert.equal(res.status, 200)
        assert.match(res.headers.get("content-type")!, /\bjson\b/)
        const json = await res.json()
        assert.match(json.VERSION, /^\d\.\d\.\d$/)
    })

    it ("CapabilityStatement", async () => {
        const res = await fetch(`${baseUrl}/fhir/metadata`)
        assert.equal(res.status, 200)
        assert.match(res.headers.get("content-type")!, /\bjson\b/)
    })

    it ("CapabilityStatement with unsupported _format parameter", async () => {
        const res = await fetch(`${baseUrl}/fhir/metadata?_format=whatever`)
        assert.equal(res.status, 400)
        assert.match(res.headers.get("content-type")!, /\bjson\b/)
        const json = await res.json()
        expectOperationOutcome(json, { diagnostics: "Only json format is supported" })
    })

    it ("CapabilityStatement with unsupported accept header", async () => {
        const res = await fetch(`${baseUrl}/fhir/metadata`, { headers: { accept: "application/xml" }})
        assert.equal(res.status, 400)
        assert.match(res.headers.get("content-type")!, /\bjson\b/)
        const json = await res.json()
        expectOperationOutcome(json, { diagnostics: "Only json format is supported" })
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

    describe("Proxy to external match server", function() {
        this.timeout(15000)

        it ("Error if the remote server replies with non-json content-type", async () => {
            mockServer.mock({ method: "post", path: "/Patient/\\$match" }, { body: "test" })
            const client = new BulkMatchClient({
                baseUrl,
                privateKey: PRIVATE_KEY,
                registrationOptions: {
                    jwks: { keys: [ PUBLIC_KEY ] },
                    matchServer: mockServer.baseUrl,
                    proxyClientId: ""
                }
            })
            await client.kickOff({ resource: [{ resourceType: "Patient", id: "#1" }] })
            const manifest = await client.waitForCompletion()
            assert.equal(manifest.output.length, 1)
            const ndjson = await client.download(0)
            const json = JSON.parse(ndjson)
            expectOperationOutcome(json.entry[0], { diagnostics: "Error: The remote server did not reply with JSON. Got the following response as text: test" })
        })

        it ("Error if the remote server replies with empty response", async () => { 
            mockServer.mock({ method: "post", path: "/Patient/\\$match" }, {
                body: "",
                headers: {
                    "content-type": "application/json"
                }
            })
            const client = new BulkMatchClient({
                baseUrl,
                privateKey: PRIVATE_KEY,
                registrationOptions: {
                    jwks: { keys: [ PUBLIC_KEY ] },
                    matchServer  : mockServer.baseUrl,
                    proxyClientId: ""
                }
            })
            await client.kickOff({ resource: [{ resourceType: "Patient", id: "#1" }] })
            const manifest = await client.waitForCompletion()
            assert.equal(manifest.output.length, 1)
            const ndjson = await client.download(0)
            const json = JSON.parse(ndjson)
            expectOperationOutcome(json.entry[0], { diagnostics: "Error: The remote server replied with empty response" })
        })

        it ("Error if the remote server replies with invalid JSON", async () => {
            mockServer.mock({ method: "post", path: "/Patient/\\$match" }, {
                body: "{a:b}",
                headers: {
                    "content-type": "application/json"
                }
            })
            const client = new BulkMatchClient({
                baseUrl,
                privateKey: PRIVATE_KEY,
                registrationOptions: {
                    jwks: { keys: [ PUBLIC_KEY ] },
                    matchServer  : mockServer.baseUrl,
                    proxyClientId: ""
                }
            })
            await client.kickOff({ resource: [{ resourceType: "Patient", id: "#1" }] })
            const manifest = await client.waitForCompletion()
            assert.equal(manifest.output.length, 1)
            const ndjson = await client.download(0)
            const json = JSON.parse(ndjson)
            expectOperationOutcome(json.entry[0], { diagnostics: /The remote server response could not be parsed as JSON/ })
        })

        it ("Appends remote OperationOutcomes to the results bundle", async () => {
            mockServer.mock({ method: "post", path: "/Patient/\\$match" }, {
                handler: (req, res) => res.json({
                    "resourceType":"OperationOutcome",
                    "issue": [
                        {
                            "severity": "error",
                            "code": "processing",
                            "diagnostics": "Test error message"
                        }
                    ]
                })
            })

            const client = new BulkMatchClient({
                baseUrl,
                privateKey: PRIVATE_KEY,
                registrationOptions: {
                    jwks: { keys: [ PUBLIC_KEY ] },
                    matchServer  : mockServer.baseUrl,
                    proxyClientId: ""
                }
            })

            await client.kickOff({ resource: [{ resourceType: "Patient", id: "#1" }] })
            const manifest = await client.waitForCompletion()
            assert.equal(manifest.output.length, 1)
            const ndjson = await client.download(0)
            const json = JSON.parse(ndjson)
            expectOperationOutcome(json.entry[0], { diagnostics: "Test error message" })
        })

        it ("expects the remote server to return a bundle", async () => {

            mockServer.mock({ method: "post", path: "/Patient/\\$match" }, {
                handler(req, res) {
                    res.json({ resourceType: "Patient" })
                }
            })

            const client = new BulkMatchClient({
                baseUrl,
                privateKey: PRIVATE_KEY,
                registrationOptions: {
                    jwks: { keys: [ PUBLIC_KEY ] },
                    matchServer: mockServer.baseUrl
                }
            })

            await client.kickOff({ resource: [{ resourceType: "Patient", id: "#1" }] })
            await client.waitForCompletion()
            const ndjson = await client.download(0)
            const json = JSON.parse(ndjson)
            expectOperationOutcome(json.entry[0], { diagnostics: /The remote server did not reply with a Bundle/ })
        })

        it ("basic use", async () => {

            function randomPatientMatchEntry() {
                const patientId = faker.string.uuid()
                return {
                    fullUrl: `${mockServer.baseUrl}/Patient/${patientId}`,
                    resource: {
                        resourceType: "Patient",
                        id: patientId
                    },
                    search: {
                        extension: [{
                            url: "http://hl7.org/fhir/StructureDefinition/match-grade",
                            valueCode: "certain"
                        }],
                        mode: "match",
                        score: faker.number.float({ min: 0.6, max: 1 })
                    }
                }
            }
            
            mockServer.mock({ method: "post", path: "/Patient/\\$match" }, {
                handler(req, res) {
                    res.json({
                        resourceType: "Bundle",
                        id: faker.string.uuid(),
                        type: "searchset",
                        total: 2,
                        entry: [
                            randomPatientMatchEntry(),
                            randomPatientMatchEntry()
                        ]
                    })
                }
            })

            const client = new BulkMatchClient({
                baseUrl,
                privateKey: PRIVATE_KEY,
                registrationOptions: {
                    jwks: { keys: [ PUBLIC_KEY ] },
                    matchServer: mockServer.baseUrl
                }
            })

            await client.kickOff({
                resource: [
                    { resourceType: "Patient", id: "#1" },
                    { resourceType: "Patient", id: "#2" },
                    { resourceType: "Patient", id: "#3" },
                ],
                count: 100
            })

            await expectResult(client, {
                numberOfFiles: 2,
                numberOfBundles: 3,
                numberOfMatches: [2, 2, 2]
            })

            const txt1   = await client.download(0)
            const txt2   = await client.download(1)
            const bundles = txt1.split(/\n/).filter(Boolean).concat(txt2.split(/\n/).filter(Boolean)).map(l => JSON.parse(l))

            // console.log(bundles)

            assert.equal(bundles[0].total, 2)
            assert.equal(
                bundles[0].meta.extension.find((e: any) => e.url === "http://hl7.org/fhir/uv/bulkdata/OperationDefinition/match-resource").valueReference.reference,
                `Patient/#1`
            )
            
            
            assert.equal(bundles[1].total, 2)
            assert.equal(
                bundles[1].meta.extension.find((e: any) => e.url === "http://hl7.org/fhir/uv/bulkdata/OperationDefinition/match-resource").valueReference.reference,
                `Patient/#2`
            )


            assert.equal(bundles[2].total, 2)
            assert.equal(
                bundles[2].meta.extension.find((e: any) => e.url === "http://hl7.org/fhir/uv/bulkdata/OperationDefinition/match-resource").valueReference.reference,
                `Patient/#3`
            )
        })

        it ("Proxy using x-proxy-url", async () => {

            function randomPatientMatchEntry() {
                const patientId = faker.string.uuid()
                return {
                    fullUrl: `${mockServer.baseUrl}/Patient/${patientId}`,
                    resource: {
                        resourceType: "Patient",
                        id: patientId
                    },
                    search: {
                        extension: [{
                            url: "http://hl7.org/fhir/StructureDefinition/match-grade",
                            valueCode: "certain"
                        }],
                        mode: "match",
                        score: faker.number.float({ min: 0.6, max: 1 })
                    }
                }
            }
            
            mockServer.mock({ method: "post", path: "/Patient/\\$match" }, {
                handler(req, res) {
                    res.json({
                        resourceType: "Bundle",
                        id: faker.string.uuid(),
                        type: "searchset",
                        total: 2,
                        entry: [
                            randomPatientMatchEntry(),
                            randomPatientMatchEntry()
                        ]
                    })
                }
            })
    
            const client = new BulkMatchClient({ baseUrl })
    
            await client.kickOff({
                resource: [
                    { resourceType: "Patient", id: "#1" },
                    { resourceType: "Patient", id: "#2" },
                    { resourceType: "Patient", id: "#3" },
                ],
                count: 100,
                headers: {
                    "x-proxy-url": mockServer.baseUrl
                }
            })
    
            await expectResult(client, {
                numberOfFiles: 2,
                numberOfBundles: 3,
                numberOfMatches: [2, 2, 2]
            })
    
            const txt1   = await client.download(0)
            const txt2   = await client.download(1)
            const bundles = txt1.split(/\n/).filter(Boolean).concat(txt2.split(/\n/).filter(Boolean)).map(l => JSON.parse(l))
    
            // console.log(bundles)
    
            assert.equal(bundles[0].total, 2)
            assert.equal(
                bundles[0].meta.extension.find((e: any) => e.url === "http://hl7.org/fhir/uv/bulkdata/OperationDefinition/match-resource").valueReference.reference,
                `Patient/#1`
            )
            
            
            assert.equal(bundles[1].total, 2)
            assert.equal(
                bundles[1].meta.extension.find((e: any) => e.url === "http://hl7.org/fhir/uv/bulkdata/OperationDefinition/match-resource").valueReference.reference,
                `Patient/#2`
            )
    
    
            assert.equal(bundles[2].total, 2)
            assert.equal(
                bundles[2].meta.extension.find((e: any) => e.url === "http://hl7.org/fhir/uv/bulkdata/OperationDefinition/match-resource").valueReference.reference,
                `Patient/#3`
            )
        })
    })

    it ("Can simulate match_error errors", async () => {
        const client = new BulkMatchClient({
            baseUrl,
            privateKey: PRIVATE_KEY,
            registrationOptions: {
                jwks: { keys: [ PUBLIC_KEY ] },
                err: "match_error",
                fakeMatches: 100
            }
        })

        await client.kickOff({
            resource: [
                { resourceType: "Patient", id: "1", name: [{ family: "Patient 1 Name" }] },
                { resourceType: "Patient", id: "2", name: [{ family: "Patient 2 Name" }] }
            ],
            count: 100
        })

        await expectResult(client, {
            numberOfFiles     : 1,
            numberOfBundles   : 2,
            percentFakeMatches: 100,
            numberOfMatches   : [2, 2]
        })

        const f = await client.download(0)
        const l = f.split(/\n/).filter(Boolean)
        const j = JSON.parse(l[0])
        assert.equal(j.entry[0].resource.resourceType, "Patient")

        expectOperationOutcome(j.entry[1].resource, {
            severity   : "error",
            diagnostics: "Match failed (simulated error)"
        })
    })

    it ("Fails if below the success threshold", async () => {
        const client = new BulkMatchClient({
            baseUrl,
            privateKey: PRIVATE_KEY,
            registrationOptions: {
                jwks: { keys: [ PUBLIC_KEY ] },
                err: "match_error",
                fakeMatches: 10
            }
        })

        await client.kickOff({
            resource: [
                { resourceType: "Patient", id: "1", name: [{ family: "Patient 1 Name" }] },
                { resourceType: "Patient", id: "2", name: [{ family: "Patient 2 Name" }] },
                { resourceType: "Patient", id: "2", name: [{ family: "Patient 2 Name" }] }
            ]
        })

        await assert.rejects(
            client.waitForCompletion(),
            /Match job failed because less than \d+% of the matches ran successfully/
        )
    })
    
    it ("percentFakeMatches with open server", async () => {
        const client   = new BulkMatchClient({ baseUrl })
        await client.kickOff({
            resource: [
                { resourceType: "Patient", id: "#1", name: [{ family: "Patient 1 Name" }] },
                { resourceType: "Patient", id: "#2", name: [{ family: "Patient 2 Name" }] },
                { resourceType: "Patient", id: "#3", name: [{ family: "Patient 3 Name" }] },
            ],
            headers: {
                "x-pct-matches": "70"
            }
        })
        await expectResult(client, {
            numberOfFiles     : 2,
            numberOfBundles   : 3,
            percentFakeMatches: 70,
            numberOfMatches   : [1, 1, 0]
        })
    })

    it ("percentFakeDuplicates with open server", async () => {
        const client = new BulkMatchClient({ baseUrl })
        await client.kickOff({
            resource: [
                { resourceType: "Patient", id: "1", name: [{ family: "Patient 1 Name" }] },
                { resourceType: "Patient", id: "2", name: [{ family: "Patient 2 Name" }] },
                { resourceType: "Patient", id: "3", name: [{ family: "Patient 3 Name" }] },
            ],
            headers: {
                "x-pct-matches": "100",
                "x-pct-duplicates": "90"
            }
        })
        await expectResult(client, {
            numberOfFiles        : 2,
            numberOfBundles      : 3,
            percentFakeMatches   : 100,
            percentFakeDuplicates: 90,
            numberOfMatches      : [2,2,2]
        })
    })
})

import assert from "assert/strict"
import BackendServicesClient from "../../src/BackendServicesClient"
import MockServer from "../MockServer"


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


describe("BackendServicesClient", () => {

    const mockServer = new MockServer("MockServer", true)
    
    before(async () => await mockServer.start())

    after(async () => await mockServer.stop())

    afterEach(() => mockServer.clear())

    it ("getWellKnownStatement", async () => {
        
        let calls = 0

        mockServer.mock("/.well-known/smart-configuration", {
            handler(req, res) {
                calls += 1
                res.json({ token_endpoint: "whatever" })
            }
        })
        
        const client = new BackendServicesClient({
            baseUrl: mockServer.baseUrl,
            clientId: "",
            privateKey: null,
            scope: ""
        })
        
        // @ts-ignore
        assert.equal(client.wellKnownStatement, null)
        assert.equal(calls, 0)

        await client.getWellKnownStatement()
        // @ts-ignore
        assert.deepEqual(client.wellKnownStatement, { token_endpoint: "whatever" })
        assert.equal(calls, 1)

        await client.getWellKnownStatement()
        // @ts-ignore
        assert.deepEqual(client.wellKnownStatement, { token_endpoint: "whatever" })
        assert.equal(calls, 1)
    })

    it ("getCapabilityStatement", async () => {
        
        let calls = 0

        mockServer.mock("/metadata", {
            handler(req, res) {
                calls += 1
                res.json({ rest: [] })
            }
        })
        
        const client = new BackendServicesClient({
            baseUrl   : mockServer.baseUrl,
            clientId  : "",
            privateKey: null,
            scope     : ""
        })
        
        // @ts-ignore
        assert.equal(client.capabilityStatement, null)
        assert.equal(calls, 0)

        await client.getCapabilityStatement()
        // @ts-ignore
        assert.deepEqual(client.capabilityStatement, { rest: [] })
        assert.equal(calls, 1)

        await client.getCapabilityStatement()
        // @ts-ignore
        assert.deepEqual(client.capabilityStatement, { rest: [] })
        assert.equal(calls, 1)
    })

    it ("getTokenUrl from wellKnownStatement", async () => {
        
        let calls = 0

        mockServer.mock("/.well-known/smart-configuration", {
            handler(req, res) {
                calls += 1
                res.json({ token_endpoint: "whatever" })
            }
        })
        
        const client = new BackendServicesClient({
            baseUrl: mockServer.baseUrl,
            clientId: "",
            privateKey: null,
            scope: ""
        })
        
        // @ts-ignore
        assert.equal(client.wellKnownStatement, null)
        // @ts-ignore
        assert.equal(client.tokenUrl, "")
        assert.equal(calls, 0)

        const result1 = await client.getTokenUrl()
        // @ts-ignore
        assert.deepEqual(client.wellKnownStatement, { token_endpoint: "whatever" })
        // @ts-ignore
        assert.equal(client.tokenUrl, "whatever")
        assert.equal(calls, 1)
        assert.equal(result1, "whatever")

        const result2 = await client.getTokenUrl()
        // @ts-ignore
        assert.deepEqual(client.wellKnownStatement, { token_endpoint: "whatever" })
        // @ts-ignore
        assert.equal(client.tokenUrl, "whatever")
        assert.equal(calls, 1)
        assert.equal(result2, "whatever")
    })

    it ("getTokenUrl from capabilityStatement", async () => {
        
        let calls = 0

        const capabilityStatement = {
            rest: [
                {
                    security: {
                        extension: [
                            {
                                url: "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris",
                                extension: [
                                    {
                                        valueUri: "whatever",
                                        url: "token"
                                    }
                                ]
                            }
                        ]
                    }
                }
            ]
        }

        mockServer.mock("/metadata", {
            handler(req, res) {
                calls += 1
                res.json(capabilityStatement)
            }
        })
        
        const client = new BackendServicesClient({
            baseUrl: mockServer.baseUrl,
            clientId: "",
            privateKey: null,
            scope: ""
        })
        
        // @ts-ignore
        assert.equal(client.capabilityStatement, null)
        // @ts-ignore
        assert.equal(client.tokenUrl, "")
        assert.equal(calls, 0)

        const result1 = await client.getTokenUrl()
        // @ts-ignore
        assert.deepEqual(client.capabilityStatement, capabilityStatement)
        // @ts-ignore
        assert.equal(client.tokenUrl, "whatever")
        assert.equal(calls, 1)
        assert.equal(result1, "whatever")

        const result2 = await client.getTokenUrl()
        // @ts-ignore
        assert.deepEqual(client.capabilityStatement, capabilityStatement)
        // @ts-ignore
        assert.equal(client.tokenUrl, "whatever")
        assert.equal(calls, 1)
        assert.equal(result2, "whatever")
    })

    it ("getAccessToken", async () => {

        let calls = 0

        mockServer.mock("/.well-known/smart-configuration", {
            handler(req, res) {
                res.json({ token_endpoint: mockServer.baseUrl + "/token" })
            }
        })

        mockServer.mock({ method: "post", path: "/token" }, {
            handler(req, res) {
                calls += 1
                res.json({
                    access_token: "my-access-token",
                    expires_in  : 300
                })
            }
        })
        
        const client = new BackendServicesClient({
            baseUrl   : mockServer.baseUrl,
            clientId  : "my_clientId",
            privateKey: PRIVATE_KEY,
            scope     : "my_scope"
        })

        const token = await client.getAccessToken()

        // console.log("token:", token)
        assert.equal(token, "my-access-token")
        assert.equal(calls, 1)

        const token2 = await client.getAccessToken()
        assert.equal(token2, "my-access-token")
        assert.equal(calls, 1)
    })

    it ("getAccessToken returns empty string if no private key is provided", async () => {
        const client = new BackendServicesClient({
            baseUrl   : mockServer.baseUrl,
            clientId  : "my_clientId",
            privateKey: null,
            scope     : "my_scope"
        })
        const token = await client.getAccessToken()
        assert.equal(token, "")
    })

    it ("getAccessToken returns empty string if no clientId is provided", async () => {
        const client = new BackendServicesClient({
            baseUrl   : mockServer.baseUrl,
            clientId  : "",
            privateKey: PRIVATE_KEY,
            scope     : "my_scope"
        })
        const token = await client.getAccessToken()
        assert.equal(token, "")
    })

    it ("refreshing an access token", async () => {

        let calls = 0

        mockServer.mock("/.well-known/smart-configuration", {
            handler(req, res) {
                res.json({ token_endpoint: mockServer.baseUrl + "/token" })
            }
        })

        mockServer.mock({ method: "post", path: "/token" }, {
            handler(req, res) {
                calls += 1
                res.json({
                    access_token: "my-access-token",
                    expires_in  : 1
                })
            }
        })
        
        const client = new BackendServicesClient({
            baseUrl   : mockServer.baseUrl,
            clientId  : "my_clientId",
            privateKey: PRIVATE_KEY,
            scope     : "my_scope"
        })

        const token = await client.getAccessToken()

        // console.log("token:", token)
        assert.equal(token, "my-access-token")
        assert.equal(calls, 1)

        const token2 = await client.getAccessToken()
        assert.equal(token2, "my-access-token")
        assert.equal(calls, 2)
    })

    it ("does not include authorization header for open servers", async () => {

        let sentHeaders: any = {}

        mockServer.mock("/", { handler(req, res) {
            sentHeaders = req.headers
            res.end()
        }})

        const client = new BackendServicesClient({
            baseUrl: mockServer.baseUrl,
            clientId: "",
            privateKey: null,
            scope: ""
        })

        await client.request("/")

        assert.equal("authorization" in sentHeaders, false)
    })

    it ("does include authorization header for protected servers", async () => {

        let sentHeaders: any = {}

        mockServer.mock("/.well-known/smart-configuration", {
            handler(req, res) {
                res.json({ token_endpoint: mockServer.baseUrl + "/token" })
            }
        })

        mockServer.mock({ method: "post", path: "/token" }, {
            handler(req, res) {
                res.json({
                    access_token: "my-access-token",
                    expires_in  : 1
                })
            }
        })

        mockServer.mock("/", { handler(req, res) {
            sentHeaders = req.headers
            res.end()
        }})

        const client = new BackendServicesClient({
            baseUrl   : mockServer.baseUrl,
            clientId  : "my_clientId",
            privateKey: PRIVATE_KEY,
            scope     : "my_scope"
        })

        await client.request("/")

        assert.equal(sentHeaders.authorization, `Bearer my-access-token`)
    })

})

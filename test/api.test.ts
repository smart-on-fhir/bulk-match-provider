
import { Server } from "http"
import assert     from "node:assert/strict"
import run        from "../src/index"
import config     from "../src/config"
import { wait } from "../src/lib"
import moment from "moment"


async function match(baseUrl: string, {
    resource,
    onlyCertainMatches,
    onlySingleMatch,
    count,
    _outputFormat
}: {
    resource?: (fhir4.Patient | any)[]
    onlyCertainMatches?: any
    onlySingleMatch?: any
    count?: any
    _outputFormat?: any
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
            accept: "application/fhir+ndjson"
        }
    })
}

describe("API", () => {

    let server : Server
    let baseUrl: string

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
        it ("Rejects invalid accept header", async () => {
            const res = await fetch(`${baseUrl}/fhir/Patient/$bulk-match`, {
                method: "POST",
                headers: { accept: "*/*" }
            })
            assert.equal(res.status, 400)
            const json = await res.json()
            assert.equal(json.statusCode, 400)
            assert.equal(json.message, "If used, the accept header must be 'application/fhir+ndjson'")
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
            assert.equal(json.statusCode, 400)
            assert.equal(json.message, "If used, the prefer header must be 'respond-async'")
        })

        it ("Rejects missing parameters body", async () => {
            const res = await fetch(`${baseUrl}/fhir/Patient/$bulk-match`, {
                method: "POST",
                headers: { accept: "application/fhir+ndjson" }
            })
            assert.equal(res.status, 400)
            const json = await res.json()
            assert.equal(json.statusCode, 400)
            assert.equal(json.message, "Invalid Parameters resource")
        })

        it ("Rejects invalid parameters body", async () => {
            const res = await fetch(`${baseUrl}/fhir/Patient/$bulk-match`, {
                method: "POST",
                body: '{"parameter":3}',
                headers: { accept: "application/fhir+ndjson" }
            })
            assert.equal(res.status, 400)
            const json = await res.json()
            assert.equal(json.statusCode, 400)
            assert.equal(json.message, "Invalid Parameters resource")
        })

        it ("Rejects empty resource parameters", async () => {
            const res = await match(baseUrl)
            assert.equal(res.status, 400)
            const json = await res.json()
            assert.equal(json.statusCode, 400)
            assert.equal(json.message, "At least one resource parameter must be provided")
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
                assert.equal(res.status, 400)
                const json = await res.json()
                assert.equal(json.statusCode, 400)
                assert.match(json.message, /Cannot use more than 2 resource parameters/)
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
            assert.equal(json.statusCode, 400)
            assert.equal(json.message, "resource[0] does not appear to be a Patient resource")
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
            assert.equal(json.statusCode, 400)
            assert.equal(json.message, 'resource[1] is required to have an "id" attribute')
        })

        it ("Validates the onlySingleMatch parameter", async () => {
            const res = await match(baseUrl, {
                resource: [{ resourceType: "Patient", id: 1 }],
                onlySingleMatch: null
            })
            assert.equal(res.status, 400)
            const json = await res.json()
            assert.equal(json.statusCode, 400)
            assert.equal(json.message, 'Only boolean values are accepted for the onlySingleMatch parameter')
        })
        
        it ("Validates the onlyCertainMatches parameter", async () => {
            const res = await match(baseUrl, {
                resource: [{ resourceType: "Patient", id: 1 }],
                onlyCertainMatches: null
            })
            assert.equal(res.status, 400)
            const json = await res.json()
            assert.equal(json.statusCode, 400)
            assert.equal(json.message, 'Only boolean values are accepted for the onlyCertainMatches parameter')
        })

        it ("Validates the count parameter", async () => {
            const res = await match(baseUrl, {
                resource: [{ resourceType: "Patient", id: 1 }],
                count: null
            })
            assert.equal(res.status, 400)
            const json = await res.json()
            assert.equal(json.statusCode, 400)
            assert.equal(json.message, 'Only integers grater than 0 are accepted for the count parameter')
        })

        it ("Validates the _outputFormat parameter", async () => {
            const res = await match(baseUrl, {
                resource: [{ resourceType: "Patient", id: 1 }],
                _outputFormat: null
            })
            assert.equal(res.status, 400)
            const json = await res.json()
            assert.equal(json.statusCode, 400)
            assert.equal(json.message, "If used, the _outputFormat parameter must be one of 'application/fhir+ndjson', 'application/ndjson' or 'ndjson'")
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

        it ("Rejects on missing jobs", async () => {
            const res = await fetch(`${baseUrl}/jobs/missingJob/status`)
            const txt = await res.text()
            assert.equal(res.status, 404)
            assert.match(txt, /Job not found/)
        })

        it ("Works", async () => {

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
            assert.equal(res2.headers.get("retry-after"), "300")

            await wait(100)

            const res3 = await fetch(statusUrl + "")
            assert.equal(res3.status, 202)
            assert.equal(res3.headers.get("x-progress"), "33% complete")
            assert.equal(res3.headers.get("retry-after"), "300")

            await wait(100)

            const res4 = await fetch(statusUrl + "")
            assert.equal(res4.status, 202)
            assert.equal(res4.headers.get("x-progress"), "66% complete")
            assert.equal(res4.headers.get("retry-after"), "300")

            await wait(100)

            const res5 = await fetch(statusUrl + "")
            assert.equal(res5.status, 200)
            const json = await res5.json()
            
            assert.ok(moment(json.transactionTime).isSame(startDate, "minute"))
            assert.equal(json.request, `${baseUrl}/fhir/Patient/$bulk-match`)
            assert.equal(json.requiresAccessToken, false)
            assert.deepEqual(json.error, [])
            assert.ok(Array.isArray(json.output))
        })
    })

    describe("Download a file", () => {

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
            await wait(200)
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

    describe("Get one jobs", () => {
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
})

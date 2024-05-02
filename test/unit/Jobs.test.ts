import assert            from "node:assert/strict"
import { writeFileSync } from "node:fs"
import { Bundle }        from "fhir/r4"
import Job               from "../../src/Job"
import "../init-tests"


describe("Job", () => {

    it ("singleton stuff", async () => {
        const job1 = await Job.create("base-url")
        const job2 = await Job.byId(job1.id)
        const job3 = await Job.byId(job1.id)
        assert.equal(job1, job2, "same instances")
        assert.equal(job2, job3, "same instances")
        assert.equal(job1, job3, "same instances")
    })

    it ("byId when the file was overridden with invalid data", async () => {
        const job = await Job.create("base-url")
        const path = job.path + "/job.json"
        writeFileSync(path, "abc", "utf8")
        await assert.rejects(Job.byId(job.id), { message: "Job corrupted" })
    })

    it ("byId when the file was overridden with invalid json", async () => {
        const job = await Job.create("base-url")
        const path = job.path + "/job.json"
        writeFileSync(path, "123", "utf8")
        await assert.rejects(Job.byId(job.id), { message: "Job corrupted" })
    })

    it ("destroyIfNeeded for jobs created too long ago", async () => {
        
        let destroyCalled = false

        const job = await Job.create("base-url")
        // @ts-ignore
        job.createdAt = 0

        job.destroy = async () => {
            destroyCalled = true
            return job
        }

        await job.save()
        await Job.destroyIfNeeded(job.id)

        assert.equal(destroyCalled, true)
    })

    it ("destroyIfNeeded for completed jobs", async () => {
        
        let destroyCalled = false

        const job = await Job.create("base-url")
        // @ts-ignore
        job.createdAt = 0
        
        // @ts-ignore
        job._percentage = 100

        job.destroy = async () => {
            destroyCalled = true
            return job
        }

        await job.save()
        await Job.destroyIfNeeded(job.id)

        assert.equal(destroyCalled, true)
    })

    it ("sortResultsBundle", () => {
        const bundle: Bundle = {
            resourceType: "Bundle",
            type: "searchset",
            entry: [
                { resource: { resourceType: "Patient", id: "1" }, search: { score: 0.4 } },
                { resource: { resourceType: "Patient", id: "2" }, search: { score: 0.2 } },
                { resource: { resourceType: "OperationOutcome", id: "3", issue: [] } },
                { resource: { resourceType: "Patient", id: "4" }, search: { score: 0.8 } }
            ]
        }

        Job.sortResultsBundle(bundle)
        // console.dir(bundle, { depth: 10 })
        assert.deepEqual(bundle, {
            resourceType: 'Bundle',
            type: 'searchset',
            entry: [
                {
                    resource: { resourceType: 'Patient', id: '4' },
                    search: { score: 0.8 }
                },
                {
                    resource: { resourceType: 'Patient', id: '1' },
                    search: { score: 0.4 }
                },
                {
                    resource: { resourceType: 'Patient', id: '2' },
                    search: { score: 0.2 }
                },
                {
                    resource: { resourceType: 'OperationOutcome', id: '3', issue: [] }
                }
            ]
        })
    })

})

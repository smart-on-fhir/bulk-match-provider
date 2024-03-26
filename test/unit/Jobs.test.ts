import assert from "node:assert/strict"
import Job from "../../src/Job"
import { lock } from "../../src/lib"
import { chmod, open } from "node:fs/promises"
import "../init-tests"


describe("Job", () => {

    it.skip ("byId", async () => {
        
        const job = await Job.create("base-url")
        
        // Job {
        //     baseUrl: 'base-url',
        //     createdAt: 1710874582083,
        //     completedAt: 0,
        //     manifest: {
        //         transactionTime: 'Tue, 19 Mar 2024 18:56:22 GMT',
        //         request: 'base-url/fhir/Patient/$bulk-match',
        //         requiresAccessToken: false,
        //         error: [],
        //         output: []
        //     },
        //     id: '2e588422321968a2',
        //     path: '/Users/vlad/dev/bulk-match-provider/test-jobs/2e588422321968a2'
        // }
        
        // const unlock = await lock(job.path)
        // console.log(job)
        const path = job.path + "/job.json"
        // const handle = await open(path, "w+")
        await chmod(path, 500)
        await assert.rejects(Job.byId(job.id), { message: "Job not readable" })
        // await handle.close()
        // await unlock()
        
        // Job.byId()

    })

    it ("destroyIfNeeded", async () => {
        const job = await Job.create("base-url")
        // @ts-ignore
        job.createdAt = 0
        await job.save()
        await Job.destroyIfNeeded(job.id)
    })

})

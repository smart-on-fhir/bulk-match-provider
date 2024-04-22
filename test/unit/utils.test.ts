import assert            from "node:assert/strict"
import { toArray, wait } from "../../src/lib"
import { createError }   from "../../src/HttpError"
import "../init-tests"


describe("wait", () => {

    it ("aborting a wait", async () => {
        const ctl   = new AbortController()
        const start = Date.now()
        setTimeout(() => ctl.abort(), 20)
        await wait(100, { signal: ctl.signal })
        const diff = Date.now() - start
        assert.ok(diff >= 20 && diff <= 25)
    })

    it ("wait with aborted signal", async () => {
        const ctl   = new AbortController()
        ctl.abort()
        const start = Date.now()
        await wait(100, { signal: ctl.signal })
        const diff = Date.now() - start
        assert.ok(diff >= 0 && diff <= 2)
    })
})

describe("toArray", () => {

    it ("No arguments -> empty array", async () => {
        // @ts-ignore
        assert.deepEqual(toArray(), [])
    })

    it ("undefined -> empty array", async () => {
        assert.deepEqual(toArray(undefined), [])
    })

    it ("returns the argument if array", async () => {
        const input: any[] = [];
        assert.ok(input === toArray(input))
    })

    it ("calls the toArray method is present", async () => {
        const input = { toArray() { return [1,2,3]; } };
        assert.deepEqual(toArray(input), [1,2,3])
    })

    it ("puts scalars into an array", async () => {
        assert.deepEqual(toArray("xy"), ["xy"])
    })
})

it ("http createError fails with invalid error codes", () => {
    assert.throws(() => { createError(600) })
})
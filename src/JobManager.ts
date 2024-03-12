import { readdir } from "fs/promises"
import config      from "./config"
import Job         from "./Job"


let timer: NodeJS.Timeout;

export async function check(dir = config.jobsDir) {
    const items = await readdir(dir, { withFileTypes: true });
    for (const entry of items) {
        if (entry.isDirectory()) {
            await Job.destroyIfNeeded(entry.name).catch(console.error)
        }
    }
}

export async function startChecking() {
    check()
    if (!timer) {
        timer = setTimeout(startChecking, config.jobCleanupMinutes * 60_000).unref()
    }
}

export async function stopChecking() {
    if (timer) {
        clearTimeout(timer)
    }
}
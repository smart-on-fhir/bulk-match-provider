import { readFileSync } from "fs"
import { join } from "path"

const fileName = process.env.NODE_ENV === "test" ? "test-patients.ndjson" : "patients.ndjson"
const ndjson   = readFileSync(join(__dirname, "../data/", fileName), "utf8")
const lines    = ndjson.trim().split(/\n/)
const patients: fhir4.Patient[] = lines.map(l => JSON.parse(l))

export default patients
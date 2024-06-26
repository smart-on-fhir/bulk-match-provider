
import moment      from "moment"
import { toArray } from "./lib"
import config      from "./config"
import { Patient } from "fhir/r4"

type MatchFunction = (input: Partial<fhir4.Patient>, patient: fhir4.Patient) => number

/**
 * @see https://hl7.org/fhir/extensions/ValueSet-match-grade.html
 */
export function getCertainty(score: number)
{
    // This record meets the matching criteria to be automatically considered as
    // a full match.
    if (score >= 1) {
        return "certain"
    }

    // This record is a close match, but not a certain match. Additional review
    // (e.g. by a human) may be required before using this as a match.
    if (score >= 0.8) {
        return "probable"
    }

    // This record may be a matching one. Additional review (e.g. by a human)
    // SHOULD be performed before using this as a match.
    if (score >= 0.6) {
        return "possible"
    }

    // This record is known not to be a match. Note that usually non-matching
    // records are not returned, but in some cases records previously or likely
    // considered as a match may specifically be negated by the matching engine.
    return "certainly-not"
}

/**
 * Matches ONE patient fragment against ALL the patients we have
 */
export function matchAll(input: Partial<fhir4.Patient>, {
    dataSet,
    baseUrl,
    limit = config.maxMatches,
    onlySingleMatch = false,
    onlyCertainMatches = false
}: {
    dataSet: fhir4.Patient[]
    baseUrl: string
    limit ?: number
    onlySingleMatch?: boolean
    onlyCertainMatches?: boolean
})
{
    const out: fhir4.BundleEntry[] = []

    let matches = dataSet.reduce((prev, resource) => {
        if (prev.length < limit) {
            const score = match(input, resource)
            const code  = getCertainty(score)
            if (code !== "certainly-not") {
                prev.push({
                    fullUrl: `${baseUrl}/fhir/${resource.resourceType}/${resource.id}`,
                    resource,
                    search: {
                        extension: [{
                            url: "http://hl7.org/fhir/StructureDefinition/match-grade",
                            valueCode: code
                        }],
                        mode: "match",
                        score
                    }
                })
            }
        }
        return prev
    }, out)

    // It is always useful to sort results by match score
    matches.sort((a, b) => b.search!.score! - a.search!.score!)

    // onlyCertainMatches means we need to have 0 or 1 match, or multiple as
    // long as they are pointing to the same patient
    if (onlyCertainMatches && matches.length > 1) {
        const first = matches[0].resource as Patient
        matches = matches.filter(x => {
            return samePatients(x.resource as Patient, first as Patient)
        })
    }

    if (onlySingleMatch) {

        // After sorting, check if we have more than one match at the top having
        // the same score. If we have multiple matches having the same score
        // (and they have less than 100% confidence), the return and empty
        // matches array because we simply cannot justify picking one over the
        // other!
        if (matches.length > 1 &&
            matches[0].search!.score! < 1 &&
            matches[0].search!.score === matches[1].search!.score
        ) {
            return []
        }

        return matches.length ? [matches[0]] : []
    }
    
    return matches
}

export function match(input: Partial<fhir4.Patient>, patient: fhir4.Patient): number {
    
    // Match by MRN ------------------------------------------------------------
    const inputMRN = getIdentifier(input, "MR")
    if (inputMRN) {
        const patientMRN = getIdentifier(patient, "MR")
        if (patientMRN) {
            return inputMRN === patientMRN ? 1 : 0
        }
    }

    // Match by SSN ------------------------------------------------------------
    const inputSSN = getIdentifier(input, "SS")
    if (inputSSN) {
        const patientSSN = getIdentifier(patient, "SS")
        if (patientSSN) {
            return inputSSN === patientSSN ? 1 : 0
        }
    }
    
    // If we are here, it means identifiers have not been used (or didn't match)
    // and it is now time to do the complex search

    // Match by name -----------------------------------------------------------
    if (!input.name?.length ||!matchName(input, patient)) {
        return 0
    }

    // Match by DOB ------------------------------------------------------------
    if (!input.birthDate || !matchDOB(input, patient)) {
        return 0
    }

    const matchers: { weight: number; match: MatchFunction }[] = [
        {
            weight: 0.5,
            match: matchGender
        },
        {
            weight: 1.4,
            match: matchPhone
        },
        {
            weight: 1.2,
            match: matchEmail
        },
        {
            weight: 0.5,
            match: matchAddress
        }
    ]

    let sum = matchers.reduce((prev, cur) => prev + cur.match(input, patient) * cur.weight, 0)
    return 0.6 + 0.4 * sum / matchers.length
}

export function matchPhone(input: Partial<fhir4.Patient>, patient: fhir4.Patient): number {
    const phones = input.telecom?.filter(x => x.system === "phone").map(x => x.value!).filter(Boolean) ?? [] as string[];
    return phones.some(phone => !!patient.telecom?.find(x => x.system === "phone" && x.value === phone)) ? 1 : 0
}

export function matchEmail(input: Partial<fhir4.Patient>, patient: fhir4.Patient): number {
    const emails = input.telecom?.filter(x => x.system === "email").map(x => x.value!).filter(Boolean) ?? [] as string[];
    return emails.some(email => !!patient.telecom?.find(x => x.system === "email" && x.value === email)) ? 1 : 0
}

export function matchAddress(input: Partial<fhir4.Patient>, patient: fhir4.Patient): number {

    const inputAddr   = flattenAddress(input)
    const patientAddr = flattenAddress(patient)

    return inputAddr.some(inputAddress => {
        return patientAddr.findIndex(p => (
            (p[0] === inputAddress[0] && p[1] && p[1] === inputAddress[1]) ||
            (p[0] === inputAddress[0] && p[2] === inputAddress[2] && p[3] === inputAddress[3])
        )) > -1
    }) ? 1 : 0
}

/**
 * TODO: Improve this! Hard match is not good enough here
 * @see https://hl7.org/fhir/R4/datatypes.html#Address
 */
function flattenAddress(input: Partial<fhir4.Patient>): (string|undefined)[][] {
    return input.address?.map(a => {
        return [
            a.line?.join(" "),
            a.postalCode?.substring(0, 5),
            a.city,
            a.state
        ]
    }) ?? []
}

/**
 * - If the input has no name return 0
 * - If the patient has no name return 0
 * - If at least one of the input names matches one of the patient names return 1
 * - Otherwise return 0
 */
export function matchName(input: Partial<fhir4.Patient>, patient: fhir4.Patient): number {
    const inputNames = flatNames(input)
    const patientNames = flatNames(patient)
    return inputNames.some(name => {
        const lowerName = name.toLowerCase()
        return patientNames.findIndex(n => n.toLowerCase() === lowerName) > -1
    }) ? 1 : 0
}

export function flatNames(patient: Partial<fhir4.Patient>): string[]
{
    return (patient.name || []).map(name => {
        // TODO: Consider other properties like use or period?
        return [
            toArray(name.given).join(" "),
            toArray(name.family).join(" ")
        ].filter(Boolean).join(" ")
    })
}

export function matchDOB(input: Partial<fhir4.Patient>, patient: fhir4.Patient): number {
    if (!patient.birthDate || !input.birthDate) {
        return 0
    }
    return moment(input.birthDate).isSame(patient.birthDate, "day") ? 1 : 0
}

/**
 * @see https://hl7.org/fhir/R4/valueset-administrative-gender.html
 */
export function matchGender(input: Partial<fhir4.Patient>, patient: fhir4.Patient): number {
    const a = patient.gender || "unknown"
    const b = input.gender || "unknown"
    return a === b ? a === "unknown" || a === "other" ? 0.5 : 1 : 0
}

export function getIdentifier(input: Partial<fhir4.Patient>, code: string): string | undefined {
    return input.identifier?.find(x => x.type?.coding?.find(c => c.code === code))?.value
}

export function samePatients(p1: Patient, p2: Patient) {
    
    // Same instance
    if (p1 === p2) {
        return true
    }
    
    // Same ID
    if (p1.id && p1.id === p2.id) {
        return true
    }

    // Same MRN
    const mrn = getIdentifier(p1, "MR")
    if (mrn && mrn === getIdentifier(p2, "MR")) {
        return true
    }

    // Same SSN
    const ssn = getIdentifier(p1, "SS")
    if (ssn && ssn === getIdentifier(p2, "SS")) {
        return true
    }
    
    // Different patient
    return false
}

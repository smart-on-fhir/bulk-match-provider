import assert from "node:assert/strict"
import { flatNames, match, matchAddress, matchDOB, matchEmail, matchGender, matchName, matchPhone } from "../../src/match"
import patients from "../../src/patients"


describe("flatNames", () => {

    it ("with single name", () => {
        const names = flatNames({
            name: [
                {
                    use: "official",
                    family: "Smith",
                    given: [ "Abram" ],
                    prefix: [ "Mr." ]
                }
            ]
        })

        assert.deepEqual(names, ["Abram Smith"])
    })

    it ("with multiple names", () => {
        const names = flatNames({
            name: [
                {
                    use: "official",
                    family: "Smith",
                    given: [ "Abram" ],
                    prefix: [ "Mr." ]
                },
                {
                    use: "official",
                    // @ts-ignore
                    family: ["Doe"],
                    given: [ "John" ],
                    prefix: [ "Mr." ]
                }
            ]
        })

        assert.deepEqual(names, ["Abram Smith", "John Doe"])
    })

    it ("with zero names", () => {
        assert.deepEqual(flatNames({}), [])
    })
})

describe("matchName", () => {

    it ("with single name", () => {
        assert.equal(matchName({
            name: [
                {
                    use: "official",
                    family: "Smith",
                    given: [ "Abram" ],
                    prefix: [ "Mr." ]
                }
            ]
        }, {
            resourceType: "Patient",
            name: [
                {
                    use: "official",
                    family: "Smith",
                    given: [ "Abram" ],
                    prefix: [ "Mr." ]
                }
            ]
        }), 1)

        assert.equal(matchName({
            name: [
                {
                    use: "official",
                    family: "Whatever",
                    given: [ "Abram" ],
                    prefix: [ "Mr." ]
                }
            ]
        }, {
            resourceType: "Patient",
            name: [
                {
                    use: "official",
                    family: "Smith",
                    given: [ "Abram" ],
                    prefix: [ "Mr." ]
                }
            ]
        }), 0)
    })

    it ("with multiple names", () => {
        assert.equal(matchName({
            name: [
                { family: "Smith", given: [ "Abram" ] },
                { family: "Smith", given: [ "John"  ] }
            ]
        }, {
            resourceType: "Patient",
            name: [{ family: "Smith", given: [ "Abram" ] }]
        }), 1)

        assert.equal(matchName({
            name: [
                { family: "Smith", given: [ "Abram" ] },
                { family: "Smith", given: [ "John"  ] }
            ]
        }, {
            resourceType: "Patient",
            name: [{ family: "Smith", given: [ "Michael" ] }]
        }), 0)
    })

})

describe("matchDOB", () => {
    it ("DOB missing in input", () => {
        assert.equal(matchDOB({}, { resourceType: "Patient", birthDate: "2020" }), 0)
    })
    it ("DOB missing in patient", () => {
        assert.equal(matchDOB({ birthDate: "2020" }, { resourceType: "Patient" }), 0)
    })
    it ("DOB missing in both places", () => {
        assert.equal(matchDOB({}, { resourceType: "Patient" }), 0)
    })
    it ("Different DOB", () => {
        assert.equal(matchDOB({ birthDate: "2015-02-18" }, { resourceType: "Patient", birthDate: "2015-02-07T13:28:17-05:00" }), 0)
    })
    it ("YYYY", () => {
        assert.equal(matchDOB({ birthDate: "2015" }, { resourceType: "Patient", birthDate: "2015-02-07T13:28:17-05:00" }), 0)
    })
    it ("YYYY-MM", () => {
        assert.equal(matchDOB({ birthDate: "2015-02" }, { resourceType: "Patient", birthDate: "2015-02-07T13:28:17-05:00" }), 0)
    })
    it ("YYYY-MM-DD", () => {
        assert.equal(matchDOB({ birthDate: "2015-02-07" }, { resourceType: "Patient", birthDate: "2015-02-07T13:28:17-05:00" }), 1)
    })
    it ("YYYY-MM-DDThh:mm:ss+zz:zz", () => {
        assert.equal(matchDOB({ birthDate: "2015-02-07T13:28:17-05:10" }, { resourceType: "Patient", birthDate: "2015-02-07T13:28:17-05:00" }), 1)
    })
})

describe("Single Patient Match", () => {
    it ("Match by MRN", async () => {
        assert.equal(match({
            identifier: [
                {
                    "type": {
                        "coding": [
                            {
                                "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
                                "code": "MR",
                                "display": "Medical Record Number"
                            }
                        ],
                        "text": "Medical Record Number"
                    },
                    "system": "http://hospital.smarthealthit.org",
                    "value": "030d1fd7-4bfd-bfab-337a-b4280ea84dda"
                }
            ]
        }, patients[0]), 1)

        assert.equal(match({
            identifier: [
                {
                    "type": {
                        "coding": [
                            {
                                "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
                                "code": "MR",
                                "display": "Medical Record Number"
                            }
                        ],
                        "text": "Medical Record Number"
                    },
                    "system": "http://hospital.smarthealthit.org",
                    "value": "6c5d9ca9-54d7-42f5-bfae-a7c19cd217f4"
                }
            ]
        }, patients[0]), 0)
    })

    it ("Match by SSN", async () => {
        assert.equal(match({
            identifier: [
                {
                    "type": {
                        "coding": [
                            {
                                "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
                                "code": "SS",
                                "display": "Social Security Number"
                            }
                        ],
                        "text": "Social Security Number"
                    },
                    "system": "http://hl7.org/fhir/sid/us-ssn",
                    "value": "999-84-9719"
                }
            ]
        }, patients[0]), 1)

        assert.equal(match({
            identifier: [
                {
                    "type": {
                        "coding": [
                            {
                                "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
                                "code": "SS",
                                "display": "Social Security Number"
                            }
                        ],
                        "text": "Social Security Number"
                    },
                    "system": "http://hl7.org/fhir/sid/us-ssn",
                    "value": "999-18-8200"
                }
            ]
        }, patients[0]), 0)
    })

    it ("Match by Name", async () => {
        assert.equal(match({
            name: [ { family: "Pfannerstill", given: ["Samuel","Rosalina"] } ]
        }, patients[0]), 0)
    })

    it ("Match by DOB", async () => {
        assert.equal(match({
            birthDate: "2023-10-11"
        }, patients[0]), 0)
    })

    it ("Match by Name + DOB", async () => {
        assert.equal(match({
            name: [ { family: "Pfannerstill", given: ["Samuel","Rosalina"] } ],
            birthDate: "2023-10-11"
        }, patients[0]), 0.6)
    })

})

describe("matchGender", () => {
    it ("female", () => {
        assert.equal(matchGender({ gender: "female" }, { gender: "female" } as fhir4.Patient), 1)
    })
    it ("male", () => {
        assert.equal(matchGender({ gender: "male" }, { gender: "male" } as fhir4.Patient), 1)
    })
    it ("other", () => {
        assert.equal(matchGender({ gender: "other" }, { gender: "other" } as fhir4.Patient), 0.5)
    })
    it ("unknown", () => {
        assert.equal(matchGender({ gender: "unknown" }, { gender: "unknown" } as fhir4.Patient), 0.5)
    })
    it ("<empty>", () => {
        assert.equal(matchGender({}, {} as fhir4.Patient), 0.5)
    })
})

describe("matchPhone", () => {
    it ("Works", () => {
        assert.equal(matchPhone(
            { telecom: [{ system: "phone", value: "555-344-3191" }] },
            { telecom: [{ system: "phone", value: "555-344-3191" }] } as fhir4.Patient
        ), 1)
        assert.equal(matchPhone(
            { telecom: [{ system: "phone", value: "555-344-3191" }] },
            { telecom: [{ system: "phone", value: "555-344-0000" }] } as fhir4.Patient
        ), 0)
        assert.equal(matchPhone(
            { telecom: [{ system: "phone", value: "555-344-3191" }] },
            { telecom: [
                { system: "phone", value: "555-344-0000" },
                { system: "phone", value: "555-344-3191" },
            ] } as fhir4.Patient
        ), 1)
        assert.equal(matchPhone(
            { telecom: [
                { system: "phone", value: "555-344-3191" },
                { system: "phone", value: "555-344-0000" },
            ] },
            { telecom: [
                { system: "phone", value: "555-344-0000" },
                { system: "phone", value: "555-344-3191" },
            ] } as fhir4.Patient
        ), 1)
    })
})

describe("matchEmail", () => {
    it ("Works", () => {
        assert.equal(matchEmail(
            { telecom: [{ system: "email", value: "example1@example.com" }] },
            { telecom: [{ system: "email", value: "example1@example.com" }] } as fhir4.Patient
        ), 1)
        assert.equal(matchEmail(
            { telecom: [{ system: "email", value: "example1@example.com" }] },
            { telecom: [{ system: "email", value: "example2@example.com" }] } as fhir4.Patient
        ), 0)
        assert.equal(matchEmail(
            { telecom: [{ system: "email", value: "example1@example.com" }] },
            { telecom: [
                { system: "email", value: "example2@example.com" },
                { system: "email", value: "example1@example.com" },
            ] } as fhir4.Patient
        ), 1)
        assert.equal(matchEmail(
            { telecom: [
                { system: "email", value: "example1@example.com" },
                { system: "email", value: "example2@example.com" },
            ] },
            { telecom: [
                { system: "email", value: "example2@example.com" },
                { system: "email", value: "example1@example.com" },
            ] } as fhir4.Patient
        ), 1)
    })
})

describe("matchAddress", () => {
    it ("line + first 5 of zip", () => {
        assert.equal(matchAddress(
            { address: [{ line: ["1021 Block Port Apt 39"], postalCode: "02351" }] },
            { address: [{ line: ["1021 Block Port Apt 39"], postalCode: "02351" }] } as fhir4.Patient
        ), 1)
        assert.equal(matchAddress(
            { address: [{ line: ["1021 Block Port Apt 39"], postalCode: "0235134" }] },
            { address: [{ line: ["1021 Block Port Apt 39"], postalCode: "02351" }] } as fhir4.Patient
        ), 1)
        assert.equal(matchAddress(
            { address: [{ line: ["1021 Block", "Port Apt 39"], postalCode: "0235134" }] },
            { address: [{ line: ["1021 Block Port Apt 39"], postalCode: "02351" }] } as fhir4.Patient
        ), 1)
    })
    it ("line + city + state", () => {
        assert.equal(matchAddress(
            { address: [{ line: ["1021 Block Port Apt 39"], city: "Brockton", state: "Massachusetts" }] },
            { address: [{ line: ["1021 Block Port Apt 39"], city: "Brockton", state: "Massachusetts" }] } as fhir4.Patient
        ), 1)
        assert.equal(matchAddress(
            { address: [{ line: ["1021 Block Port Apt 39"], city: "Boston"  , state: "Massachusetts" }] },
            { address: [{ line: ["1021 Block Port Apt 39"], city: "Brockton", state: "Massachusetts" }] } as fhir4.Patient
        ), 0)
    })
})

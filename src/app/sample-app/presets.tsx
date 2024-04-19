export interface Preset {
    name: string | JSX.Element
    description?: string
    params: {
        onlySingleMatch: boolean,
        onlyCertainMatches: boolean,
        resources: fhir4.Patient[]
        count?: number | null
    }
}



export const PRESETS: (Preset | "-")[] = [
    {
        name: <span>Match by <b className="badge text-success">MRN</b></span>,
        description: "Match by Medical Record Number. There should be exactly one match with 100% confidence.",
        params: {
            onlySingleMatch: true,
            onlyCertainMatches: true,
            resources: [
                {
                    "resourceType": "Patient",
                    "id": "234",
                    "identifier": [
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
                            "value": "cb22b7e5-7355-b298-a938-2aa88dd5b081"
                        }
                    ]
                }
            ]
        }
    },
    {
        name: <span>Match by <b className="badge text-success">SSN</b></span>,
        description: "Match by Social Security Number. There should be exactly one match with 100% confidence.",
        params: {
            onlySingleMatch: true,
            onlyCertainMatches: true,
            resources: [
                {
                    "resourceType": "Patient",
                    "id": "234",
                    "identifier": [
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
                            "value": "999-86-3191"
                        }
                    ]
                }
            ]
        }
    },
    "-",
    {
        name: <span>Match <b className="badge">Name</b> + <b className="badge">DOB</b></span>,
        params: {
            onlySingleMatch: false,
            onlyCertainMatches: false,
            resources: [
                {
                    "resourceType": "Patient",
                    "id": "123",
                    "birthDate": "1967-10-27",
                    "name": [
                        {
                            "use": "official",
                            "family": "Doyle",
                            "given": ["Minh","Eli"],
                            "prefix":["Mr."]
                        }
                    ]
                },
                {
                    "resourceType": "Patient",
                    "id": "234",
                    "birthDate": "1989-12-27",
                    "name":[
                        {
                            "use": "official",
                            "family": "Deckow",
                            "given": ["Mose","Hipolito"],
                            "prefix":["Mr."]
                        }
                    ]
                }
            ]
        }
    },
    {
        name: <span>Match <b className="badge">Name</b> + <b className="badge">DOB</b> + <b className="badge">Gender</b></span>,
        params: {
            onlySingleMatch: false,
            onlyCertainMatches: false,
            resources: [
                {
                    "resourceType": "Patient",
                    "id": "123",
                    "gender": "male",
                    "birthDate": "1967-10-27",
                    "name": [
                        {
                            "use": "official",
                            "family": "Doyle",
                            "given": ["Minh","Eli"],
                            "prefix":["Mr."]
                        }
                    ]
                }
            ]
        }
    },
    {
        name: <span>Match <b className="badge">Name</b> + <b className="badge">DOB</b> + <b className="badge">Address</b></span>,
        params: {
            onlySingleMatch: false,
            onlyCertainMatches: false,
            resources: [
                {
                    "resourceType": "Patient",
                    "id": "030d1fd7-4bfd-bfab-337a-b4280ea84dda",
                    "name": [
                        {
                            "use": "official",
                            "family": "Pfannerstill",
                            "given": [
                                "Samuel",
                                "Rosalina"
                            ]
                        }
                    ],
                    "birthDate": "2023-10-11",
                    "address": [
                        {
                            "line": [
                                "1021 Block Port Apt 39"
                            ],
                            "city": "Brockton",
                            "state": "Massachusetts",
                            "postalCode": "02351",
                            "country": "US"
                        }
                    ]
                }
            ]
        }
    },
    {
        name: <span>Match <b className="badge">Name</b> + <b className="badge">DOB</b> + <b className="badge">Phone</b></span>,
        params: {
            onlySingleMatch: false,
            onlyCertainMatches: false,
            resources: [
                {
                    "resourceType": "Patient",
                    "id": "030d1fd7-4bfd-bfab-337a-b4280ea84dda",
                    "name": [
                        {
                            "use": "official",
                            "family": "Pfannerstill",
                            "given": [
                                "Samuel",
                                "Rosalina"
                            ]
                        }
                    ],
                    "telecom": [
                        {
                            "system": "phone",
                            "value": "555-344-3191",
                            "use": "home"
                        }
                    ],
                    "birthDate": "2023-10-11",
                }
            ]
        }
    },
    {
        name: <span>Match <b className="badge">Name</b> + <b className="badge">DOB</b> + <b className="badge">Email</b></span>,
        params: {
            onlySingleMatch: false,
            onlyCertainMatches: false,
            resources: [
                {
                    "resourceType": "Patient",
                    "id": "030d1fd7-4bfd-bfab-337a-b4280ea84dda",
                    "name": [
                        {
                            "use": "official",
                            "family": "Pfannerstill",
                            "given": [
                                "Samuel",
                                "Rosalina"
                            ]
                        }
                    ],
                    "telecom": [
                        {
                            "system": "email",
                            "value": "example@example.com",
                        }
                    ],
                    "birthDate": "2023-10-11",
                }
            ]
        }
    },
    {
        name: <span> Match <b className="badge">Name</b> + <b className="badge">DOB</b> + <b className="badge">Gender</b> + <b className="badge">Phone</b></span>,
        params: {
            onlySingleMatch: false,
            onlyCertainMatches: false,
            resources: [
                {
                    "resourceType": "Patient",
                    "id": "030d1fd7-4bfd-bfab-337a-b4280ea84dda",
                    "name": [
                        {
                            "use": "official",
                            "family": "Pfannerstill",
                            "given": [
                                "Samuel",
                                "Rosalina"
                            ]
                        }
                    ],
                    "telecom": [
                        {
                            "system": "phone",
                            "value": "555-344-3191",
                            "use": "home"
                        }
                    ],
                    "gender": "female",
                    "birthDate": "2023-10-11",
                }
            ]
        }
    },
    {
        name: <span>Match <b className="badge">Name</b> + <b className="badge">DOB</b> + <b className="badge">Email</b> + <b className="badge">Phone</b></span>,
        params: {
            onlySingleMatch: false,
            onlyCertainMatches: false,
            resources: [
                {
                    "resourceType": "Patient",
                    "id": "030d1fd7-4bfd-bfab-337a-b4280ea84dda",
                    "name": [
                        {
                            "use": "official",
                            "family": "Pfannerstill",
                            "given": [
                                "Samuel",
                                "Rosalina"
                            ]
                        }
                    ],
                    "telecom": [
                        {
                            "system": "phone",
                            "value": "555-344-3191",
                        },
                        {
                            "system": "email",
                            "value": "example@example.com",
                        }
                    ],
                    "birthDate": "2023-10-11",
                }
            ]
        }
    },
    {
        name: <span>Match <b className="badge">Name</b> + <b className="badge">DOB</b> + <b className="badge">Gender</b> + <b className="badge">Email</b></span>,
        params: {
            onlySingleMatch: false,
            onlyCertainMatches: false,
            resources: [
                {
                    "resourceType": "Patient",
                    "id": "030d1fd7-4bfd-bfab-337a-b4280ea84dda",
                    "name": [
                        {
                            "use": "official",
                            "family": "Pfannerstill",
                            "given": [
                                "Samuel",
                                "Rosalina"
                            ]
                        }
                    ],
                    "telecom": [
                        {
                            "system": "email",
                            "value": "example@example.com",
                        }
                    ],
                    "gender": "female",
                    "birthDate": "2023-10-11",
                }
            ]
        }
    },
    {
        name: <span>Match <b className="badge">Name</b> + <b className="badge">DOB</b> + <b className="badge">Gender</b> + <b className="badge">Phone</b></span>,
        params: {
            onlySingleMatch: false,
            onlyCertainMatches: false,
            resources: [
                {
                    "resourceType": "Patient",
                    "id": "030d1fd7-4bfd-bfab-337a-b4280ea84dda",
                    "name": [
                        {
                            "use": "official",
                            "family": "Pfannerstill",
                            "given": [
                                "Samuel",
                                "Rosalina"
                            ]
                        }
                    ],
                    "telecom": [
                        {
                            "system": "phone",
                            "value": "555-344-3191",
                            "use": "home"
                        },
                    ],
                    "gender": "female",
                    "birthDate": "2023-10-11"
                }
            ]
        }
    },
    {
        name: <span>Match <b className="badge">Name</b> + <b className="badge">DOB</b> + <b className="badge">Gender</b> + <b className="badge">Address</b></span>,
        params: {
            onlySingleMatch: false,
            onlyCertainMatches: false,
            resources: [
                {
                    "resourceType": "Patient",
                    "id": "030d1fd7-4bfd-bfab-337a-b4280ea84dda",
                    "name": [
                        {
                            "use": "official",
                            "family": "Pfannerstill",
                            "given": [
                                "Samuel",
                                "Rosalina"
                            ]
                        }
                    ],
                    "gender": "female",
                    "birthDate": "2023-10-11",
                    "address": [
                        {
                            "line": [
                                "1021 Block Port Apt 39"
                            ],
                            "city": "Brockton",
                            "state": "Massachusetts",
                            "postalCode": "02351",
                            "country": "US"
                        }
                    ]
                }
            ]
        }
    },
    {
        name: <span>Match <b className="badge">Name</b> + <b className="badge">DOB</b> + <b className="badge">Gender</b> + <b className="badge">Phone</b> + <b className="badge">Email</b></span>,
        params: {
            onlySingleMatch: false,
            onlyCertainMatches: false,
            resources: [
                {
                    "resourceType": "Patient",
                    "id": "030d1fd7-4bfd-bfab-337a-b4280ea84dda",
                    "name": [
                        {
                            "use": "official",
                            "family": "Pfannerstill",
                            "given": [
                                "Samuel",
                                "Rosalina"
                            ]
                        }
                    ],
                    "telecom": [
                        {
                            "system": "phone",
                            "value": "555-344-3191",
                        },
                        {
                            "system": "email",
                            "value": "example@example.com",
                        }
                    ],
                    "gender": "female",
                    "birthDate": "2023-10-11",
                }
            ]
        }
    },
    {
        name: <span>Match <b className="badge">Name</b> + <b className="badge">DOB</b> + <b className="badge">Gender</b> + <b className="badge">Phone</b> + <b className="badge">Email</b> + <b className="badge">Address</b></span>,
        params: {
            onlySingleMatch: false,
            onlyCertainMatches: false,
            resources: [
                {
                    "resourceType": "Patient",
                    "id": "030d1fd7-4bfd-bfab-337a-b4280ea84dda",
                    "name": [
                        {
                            "use": "official",
                            "family": "Pfannerstill",
                            "given": [
                                "Samuel",
                                "Rosalina"
                            ]
                        }
                    ],
                    "telecom": [
                        {
                            "system": "phone",
                            "value": "555-344-3191",
                            "use": "home"
                        },
                        {
                            "system": "email",
                            "value": "example@example.com",
                            "use": "work"
                        }
                    ],
                    "gender": "female",
                    "birthDate": "2023-10-11",
                    "address": [
                        {
                            "line": [
                                "1021 Block Port Apt 39"
                            ],
                            "city": "Brockton",
                            "state": "Massachusetts",
                            "postalCode": "02351",
                            "country": "US"
                        }
                    ]
                }
            ]
        }
    }
]

export default PRESETS

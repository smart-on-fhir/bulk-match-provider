import { Request, Response } from "express"
import pkg                   from "../package.json"
import { createOperationOutcome, getRequestBaseURL } from "./lib"


const SERVER_START_TIME = new Date().toISOString()

const SUPPORTED_FORMATS = [
    "application/fhir+json",
    "application/json+fhir",
    "application/json",
    "text/json",
    "json"
];

const SUPPORTED_ACCEPT_MIME_TYPES = [
    "application/fhir+json",
    "application/json+fhir",
    "application/json",
    "text/json",
    "text/html", // for browsers
    "json",
    "*/*"
];

export default function(req: Request, res: Response) {
    const { query } = req

    if (query._format) {
        let format = String(query._format).toLowerCase();
        if (!SUPPORTED_FORMATS.some(mime => format.indexOf(mime) === 0)) {
            res.status(400).json(createOperationOutcome("Only json format is supported"))
            return
        }
    }

    const accept = String(req.headers.accept || "*/*").toLowerCase().split(/\s*[;,]\s*/).shift();
    if (!SUPPORTED_ACCEPT_MIME_TYPES.some(f => f === accept)) {
        res.status(400).json(createOperationOutcome("Only json format is supported"))
        return
    }

    const baseUrl = getRequestBaseURL(req)


    res.set("content-type", "application/fhir+json; charset=utf-8")
    res.json({
        resourceType: "CapabilityStatement",
        status: "active",
        date: SERVER_START_TIME,
        publisher: "Boston Children's Hospital",
        kind: "instance",
        instantiates: [
            "http://hl7.org/fhir/uv/bulkdata/CapabilityStatement/bulk-data"
        ],
        software: {
            name: "Bulk Match Server (reference implementation)",
            version: pkg.version
        },
        implementation: {
            "description": "SMART Bulk Match Server"
        },
        fhirVersion: "4.0.0",
        acceptUnknown: "extensions",
        format: [ "application/fhir+json" ],
        rest: [
            {
                mode: "server",
                security: {
                    extension: [
                        {
                            url: "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris",
                            extension: [
                                {
                                    url: "token",
                                    valueUri: `${baseUrl}/auth/token`
                                },
                                {
                                    url: "register",
                                    valueUri: `${baseUrl}/auth/register`
                                }
                            ]
                        }
                    ],
                    service: [
                        {
                            coding: [
                                {
                                    system : "http://hl7.org/fhir/restful-security-service",
                                    code   : "SMART-on-FHIR",
                                    display: "SMART-on-FHIR"
                                }
                            ],
                            text: "OAuth2 using SMART-on-FHIR profile (see http://docs.smarthealthit.org)"
                        }
                    ]
                },
                resource: [],
                operation: [
                    {
                        extension: [
                            {
                                url      : "http://hl7.org/fhir/StructureDefinition/capabilitystatement-expectation",
                                valueCode: "SHOULD"
                            }
                        ],
                        name: "bulk-match",
                        definition: `${baseUrl}/fhir/OperationDefinition/bulk-match`
                    }
                ]
            }
        ]
    });
}

import { Request, Response } from "express"


const SERVER_START_TIME = new Date();

export function handleOperationDefinition(req: Request, res: Response) {
    res.set("content-type", "application/fhir+json; charset=utf-8")
    res.json({
        "resourceType" : "OperationDefinition",
        "id" : "bulk-match",
        "text" : {
            "status" : "extensions",
            "div" : "<div xmlns=\"http://www.w3.org/1999/xhtml\"><p>URL: [base]/Patient/$bulk-match</p><p>Parameters</p><table class=\"grid\"><tr><td><b>Use</b></td><td><b>Name</b></td><td><b>Scope</b></td><td><b>Cardinality</b></td><td><b>Type</b></td><td><b>Binding</b></td><td><b>Documentation</b></td></tr><tr><td>IN</td><td>resource</td><td/><td>1..*</td><td><a href=\"http://hl7.org/fhir/R4/resource.html\">Resource</a></td><td/><td><div><p>Use this to provide an entire set of patient details to match against.</p>\n</div></td></tr><tr><td>IN</td><td>onlySingleMatch</td><td/><td>0..1</td><td><a href=\"http://hl7.org/fhir/R4/datatypes.html#boolean\">boolean</a></td><td/><td><div><p>If there are multiple potential matches, the server should identify the single most appropriate match that should be used with future interactions with the server (for example, as part of a subsequent create interaction).</p>\n</div></td></tr><tr><td>IN</td><td>onlyCertainMatches</td><td/><td>0..1</td><td><a href=\"http://hl7.org/fhir/R4/datatypes.html#boolean\">boolean</a></td><td/><td><div><p>If there are multiple potential matches, the server should be certain that each of the records are for the same patients.  This could happen if the records are duplicates, are the same person for the purpose of data segregation, or other reasons.  When false, the server may return multiple results with each result graded accordingly.</p>\n</div></td></tr><tr><td>IN</td><td>count</td><td/><td>0..1</td><td><a href=\"http://hl7.org/fhir/R4/datatypes.html#integer\">integer</a></td><td/><td><div><p>The maximum number of records to return. If no value is provided, the server decides how many matches to return. Note that clients should be careful when using this, as it may prevent probable - and valid - matches from being returned</p>\n</div></td></tr><tr><td>IN</td><td>_outputFormat</td><td/><td>0..1</td><td><a href=\"http://hl7.org/fhir/R4/datatypes.html#string\">string</a></td><td/><td><div><p>Support is required for a server, optional for a client.</p>\n<p>The format for the requested Bulk Data files to be generated as per <a href=\"http://hl7.org/fhir/R4/async.html\">FHIR Asynchronous Request Pattern</a>. Defaults to <code>application/fhir+ndjson</code>. The server SHALL support <a href=\"http://ndjson.org\">Newline Delimited JSON</a>, but MAY choose to support additional output formats. The server SHALL accept the full content type of <code>application/fhir+ndjson</code> as well as the abbreviated representations <code>application/ndjson</code> and <code>ndjson</code>.</p>\n</div></td></tr></table></div>"
        },
        "extension" : [
            {
                "url" : "http://hl7.org/fhir/StructureDefinition/structuredefinition-fmm",
                "valueInteger" : 0
            },
            {
                "url" : "http://hl7.org/fhir/StructureDefinition/structuredefinition-standards-status",
                "valueCode" : "trial-use"
            },
            {
                "url" : "http://hl7.org/fhir/StructureDefinition/structuredefinition-wg",
                "valueCode" : "fhir"
            }
        ],
        "url" : "http://hl7.org/fhir/uv/bulkdata/OperationDefinition/bulk-match",
        "version" : "2.0.0",
        "name" : "Match",
        "title" : "FHIR Bulk Match Operation",
        "status" : "draft",
        "kind" : "operation",
        "experimental" : false,
        "date" : SERVER_START_TIME.toISOString(),
        "publisher" : "HL7 International - FHIR Infrastructure Work Group",
        "contact" : [
            {
                "telecom" : [
                    {
                        "system" : "url",
                        "value" : "http://hl7.org/Special/committees/fiwg"
                    }
                ]
            }
        ],
        "description" : "FHIR Operation for a client determine the FHIR Patient resource ids of a set of patients in a FHIR server by transmitting demographic information.",
        "jurisdiction" : [
            {
                "coding" : [
                    {
                        "system" : "http://unstats.un.org/unsd/methods/m49/m49.htm",
                        "code" : "001"
                    }
                ]
            }
        ],
        "affectsState" : false,
        "code" : "bulk-match",
        "resource" : [
            "Patient"
        ],
        "system" : false,
        "type" : true,
        "instance" : false,
        "parameter" : [
            {
                "name" : "resource",
                "use" : "in",
                "min" : 1,
                "max" : "*",
                "documentation" : "Use this to provide an entire set of patient details to match against.",
                "type" : "Resource"
            },
            {
                "name" : "onlySingleMatch",
                "use" : "in",
                "min" : 0,
                "max" : "1",
                "documentation" : "If there are multiple potential matches, the server should identify the single most appropriate match that should be used with future interactions with the server (for example, as part of a subsequent create interaction).",
                "type" : "boolean"
            },
            {
                "name" : "onlyCertainMatches",
                "use" : "in",
                "min" : 0,
                "max" : "1",
                "documentation" : "If there are multiple potential matches, the server should be certain that each of the records are for the same patients.  This could happen if the records are duplicates, are the same person for the purpose of data segregation, or other reasons.  When false, the server may return multiple results with each result graded accordingly.",
                "type" : "boolean"
            },
            {
                "name" : "count",
                "use" : "in",
                "min" : 0,
                "max" : "1",
                "documentation" : "The maximum number of records to return. If no value is provided, the server decides how many matches to return. Note that clients should be careful when using this, as it may prevent probable - and valid - matches from being returned",
                "type" : "integer"
            },
            {
                "name" : "_outputFormat",
                "use" : "in",
                "min" : 0,
                "max" : "1",
                "documentation" : "Support is required for a server, optional for a client.\n\nThe format for the requested Bulk Data files to be generated as per [FHIR Asynchronous Request Pattern](http://hl7.org/fhir/R4/async.html). Defaults to `application/fhir+ndjson`. The server SHALL support [Newline Delimited JSON](http://ndjson.org), but MAY choose to support additional output formats. The server SHALL accept the full content type of `application/fhir+ndjson` as well as the abbreviated representations `application/ndjson` and `ndjson`.",
                "type" : "string"
            }
        ]
    })
}

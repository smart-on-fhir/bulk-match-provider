import { useCallback, useEffect, useState } from "react"
import { MatchManifest } from "../../.."
import Collapse from "./Collapse"
import { roundToPrecision } from "./lib"
import { Bundle } from "fhir/r4"


export default function MatchResults({ manifest }: { manifest: MatchManifest }) {

    return (
        <div className="card border-success my-4 border-opacity-50 shadow-sm">
            <div className="card-header bg-success border-success bg-opacity-25 border-opacity-25">
                <b><i className="bi bi-search me-1" />Match Results</b>
            </div>
            <div className="card-body">
            { manifest.output.length ? manifest.output.map((entry, i) => {
                const count = entry?.count
                return (
                    <Collapse key={i} header={
                        <>
                            <span>{ entry.url }</span>
                            <a href={ entry.url } rel="download" onClick={ e => e.stopPropagation() } className="mx-4">
                                <i className="bi bi-cloud-download" />
                            </a>
                            <span className="badge rounded-pill bg-success-subtle text-success">{ count } bundles</span>
                        </>
                    } open>
                        <BundlePreview url={entry.url} />
                    </Collapse>
                )
            }) : <b className="text-danger">No matches</b> }
            </div>
        </div>
    )
}

function BundlePreview({
    url
}: {
    url: string
})
{
    const [data   , setData   ] = useState<Bundle[] | Error[] | null>(null)
    const [loading, setLoading] = useState(true)
    const [error  , setError  ] = useState<Error | null>(null)

    const abortController = new AbortController()

    const fetchData = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res  = await fetch(url, { signal: abortController.signal })
            const txt  = await res.text()
            const json = txt.split(/\s*\n+\s*/).filter(Boolean).map(line => {
                try {
                    return JSON.parse(line)
                } catch (ex) {
                    return ex
                }
            })
            setData(json)
        } catch (ex) {
            setError(ex as Error)
        } finally {
            setLoading(false)
        }
    }, [url])

    useEffect(() => {
        fetchData()
        return () => {
            abortController.abort()
        }
    }, [])

    if (loading) {
        return <span className="spinner-border spinner-border-sm text-muted me-1">Loading...</span>
    }

    if (error) {
        return <div className="alert alert-danger">{ error + "" }</div>
    }

    if (!data) {
        return <div className="alert alert-danger">No Data!</div>
    }

    return <div>
        { data.map((item, i) => {
            if (item instanceof Error) {
                return (
                    <Collapse key={i} header="Error">{ JSON.stringify(item, null, 4) }</Collapse>
                )
            }

            const inputPatient = item.meta?.extension?.find(
                e => e.url === "http://hl7.org/fhir/uv/bulkdata/OperationDefinition/match-resource"
            )?.valueReference?.reference

            return (
                <Collapse key={i} header={<div>Bundle for <b>{inputPatient}</b> <span className="badge rounded-pill bg-success-subtle text-success align-text-bottom ms-2">{item.total} results</span></div>}>
                    { item.entry?.map((entry, y) => {
                        if (entry.resource?.resourceType === "Patient") {
                            
                            return <li key={y}>
                                <a href={ entry.fullUrl } target="_blank" rel="noreferrer noopener">
                                    { humanName((entry.resource as fhir4.Patient)) }<i className="bi bi-box-arrow-up-right ms-1 me-3"/>
                                </a>
                                <span className="small text-muted">
                                    { entry.search?.score ? " (" + roundToPrecision(entry.search.score * 100, 2) + "% match)" : "" }
                                </span>
                            </li>
                        }
                        return <div className="alert alert-danger small" key={y}>{ JSON.stringify(item.entry, null, 0) }</div>
                    }) }
                </Collapse>
            )
        }) }
    </div>
}

export type FHIRPerson = fhir2.Patient | fhir3.Patient | fhir4.Patient | fhir2.Practitioner | fhir3.Practitioner | fhir4.Practitioner

export function toArray(x: any) {
    if (!Array.isArray(x)) {
        return [ x ];
    }
    return x;
}

export function humanName(human: FHIRPerson): string {
    let names = human.name || [];
    if (!Array.isArray(names)) {
        names = [ names ];
    }
    
    let name = names[0];
    
    if (!name) {
        name = { family: [ "No Name Listed" ] };
    }
    
    const prefix = toArray(name.prefix || "").filter(Boolean).join(" ")
    const given  = toArray(name.given  || "").filter(Boolean).join(" ")
    const family = toArray(name.family || "").filter(Boolean).join(" ")
    
    let out = [prefix, given, family].filter(Boolean).join(" ");
    
    if (name.suffix) {
        out += ", " + name.suffix;
    }

    return out;
}

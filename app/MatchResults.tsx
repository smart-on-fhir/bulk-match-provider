import { useEffect, useState } from "react"
import { MatchManifest } from ".."
import Collapse from "./Collapse"
import { roundToPrecision } from "./lib"


interface MatchResult {
    url     : string,
    results?: fhir4.Bundle
}


export default function MatchResults({ manifest }: { manifest: MatchManifest }) {
    
    const [results, setResults] = useState<MatchResult[]>(manifest.output.map(e => ({ url: e.url })));

    useEffect(() => {
        Promise.all(results.map(entry => {
            return fetch(entry.url)
                .then(r => r.json())
                .then(results => ({ ...entry, results }))
        })).then(setResults)
    }, []);

    return (
        <div className="card mt-4">
            <div className="card-header">
                <b><i className="bi bi-search me-1" />Match Results</b>
            </div>
            <div className="card-body">
            { results.length ? results.map((entry, i) => {
                const count = entry.results?.entry?.length
                return (
                    <Collapse key={i} header={
                        <><span>{ entry.url }</span><span className="badge rounded-pill text-bg-success mx-2">{ count }</span></>
                    } open>
                        <ul>
                        { entry.results?.entry?.map((o, y) => (
                            <li key={y}>
                                <a href={ o.fullUrl }>{ humanName((o.resource as fhir4.Patient)) }</a>
                                { o.search?.score ? " (" + roundToPrecision(o.search.score * 100, 2) + "% match)" : "" }
                            </li>
                        )) }
                        </ul>
                    </Collapse>
                )
            }) : <b className="text-danger">No matches</b> }
            </div>
        </div>
    )
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

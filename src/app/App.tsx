import { FormEvent, useEffect, useReducer } from "react"
import PresetSelector            from "./PresetSelector"
import type { Preset }           from "./presets"
import Collapse                  from "./Collapse"
import Status                    from "./Status"
import MatchRequest              from "./MatchRequest"
import MatchResults              from "./MatchResults"
import { MatchManifest }         from "../.."
import ResponseView              from "./Response"
import "./style.scss"


interface State {
    error  : Error | null
    matchRequest: {
        loading           : boolean
        baseUrl           : string
        onlySingleMatch   : boolean
        onlyCertainMatches: boolean
        count            ?: number
        _outputFormat    ?: string
        resources         : string//(Partial<fhir4.Patient>)[]
        submittedAt      ?: number
    }
    matchResponse: {
        headers: Record<string, string>
        text: string
        response?: Response
        payload?: any
    }
    statusURL: string
    statusResponses: {
        statusHeading: string,
        text: string
    }[]
    manifest?: MatchManifest | null
    snippet: Preset | null
}

const initialState: State = {
    error        : null,
    snippet      : null,
    matchRequest : {
        loading           : false,
        baseUrl           : process.env.NODE_ENV === "production" ?
            window.location.origin + "/fhir/" :
            "http://127.0.0.1:3456/fhir/",
        onlySingleMatch   : false,
        onlyCertainMatches: false,
        count             : 0,
        submittedAt       : 0,
        resources         : `[]`
    },
    matchResponse: {
        headers: {},
        text: ""
    },
    statusURL      : "",
    statusResponses: [],
    manifest       : null

}

function reducer(state: State, payload: Partial<State>): State {
    return { ...state, ...payload };
}

export default function App() {

    const [state, dispatch] = useReducer(reducer, initialState);

    const {
        matchRequest,
        matchResponse
    } = state;

    async function sendMatchRequest(e: FormEvent) {

        e.preventDefault()

        const {
            matchRequest: {
                baseUrl,
                resources,
                onlySingleMatch,
                onlyCertainMatches,
                _outputFormat,
                count
            }
        } = state
        
        const url = new URL("Patient/$bulk-match", baseUrl + "")

        const body: fhir4.Parameters = {
            resourceType: "Parameters",
            parameter: []
        }

        try {
            var patients = JSON.parse(resources + "")
        } catch (error) {
            return dispatch({ error: error as Error })
        }

        if (patients) {
            patients.forEach((p: any) => body.parameter!.push({ name: "resource", resource: p }))
        }
    
        body.parameter!.push({ name: "onlySingleMatch"   , valueBoolean: onlySingleMatch    })
        body.parameter!.push({ name: "onlyCertainMatches", valueBoolean: onlyCertainMatches })
        
        if (count) {
            body.parameter!.push({ name: "count", valueInteger: count })
        }
    
        if (_outputFormat) {
            body.parameter!.push({ name: "_outputFormat", valueString: _outputFormat })
        }

        dispatch({ error: null, matchRequest: { ...state.matchRequest, loading: true } })

        try {
            const res = await fetch(url, {
                method : "POST",
                body: JSON.stringify(body),
                headers: {
                    "Content-Type": "application/json",
                    accept: "application/fhir+ndjson"
                }
            })

            const json = await res.json()
            
            let txt = []
            // res.headers.forEach((value, key) => {
            //     txt.push(`${key}: ${value}\n`)
            // })
            // txt.push("\n")
            txt.push(JSON.stringify(json, null, 4))

            dispatch({
                matchResponse: {
                    headers: Object.fromEntries(res.headers.entries()),
                    text: txt.join(""),
                    response: res,
                    payload: json
                },
                matchRequest: {
                    ...state.matchRequest,
                    loading: false,
                    submittedAt: Date.now()
                },
                statusURL: res.headers.get("content-location") || ""
            })
            
        } catch (ex) {
            dispatch({ error: ex as Error })
        }
    }

    return (
        <>
            <nav className="navbar sticky-top navbar-expand-lg bg-primary">
                <div className="container">
                    <a className="navbar-brand text-white" href="/">
                        <i className="bi bi-fire me-1" />
                        Bulk-Match <small className="opacity-50">Sample App</small>
                    </a>
                    <button
                        className="navbar-toggler"
                        type="button"
                        data-bs-toggle="collapse"
                        data-bs-target="#navbarSupportedContent"
                        aria-controls="navbarSupportedContent"
                        aria-expanded="false"
                        aria-label="Toggle navigation">
                        <span className="navbar-toggler-icon"></span>
                    </button>
                    <div className="collapse navbar-collapse" id="navbarSupportedContent">
                        <ul className="navbar-nav me-auto"></ul>
                        <PresetSelector value={state.snippet} onChange={s => {
                            const resources = JSON.stringify(s?.params.resources || [], null, 2)
                            dispatch({
                                ...initialState,
                                matchRequest: {
                                    ...initialState.matchRequest,
                                    onlySingleMatch   : s?.params.onlySingleMatch    ?? initialState.matchRequest.onlySingleMatch,
                                    onlyCertainMatches: s?.params.onlyCertainMatches ?? initialState.matchRequest.onlyCertainMatches,
                                    count             : s?.params.count              ?? initialState.matchRequest.count,
                                    resources
                                },
                                snippet: s
                            })
                        }} />
                    </div>
                </div>
            </nav>
            <div className="container my-3">
                <Collapse header={ <h5 className="m-0">Bulk-Match Request</h5> } open>
                    <MatchRequest
                        state={{
                            baseUrl           : matchRequest.baseUrl,
                            onlyCertainMatches: matchRequest.onlyCertainMatches,
                            onlySingleMatch   : matchRequest.onlySingleMatch,
                            count             : matchRequest.count,
                            resources         : matchRequest.resources,
                        }}
                        onChange={p => dispatch({ matchRequest: { ...matchRequest, ...p }})}
                        onSubmit={sendMatchRequest}
                    />
                </Collapse>
                { matchRequest.loading && <div className="spinner-border text-secondary" role="status"/> }
                { matchResponse.response && <ResponseView response={ matchResponse.response! } payload={ matchResponse.payload } heading="Bulk-Match Response" /> }
                { state.statusURL && <Status statusURL={ state.statusURL } key={"status-" + matchRequest.submittedAt} onComplete={ manifest => dispatch({ manifest }) } /> }
                { state.manifest && <MatchResults manifest={state.manifest} key={"result-" + matchRequest.submittedAt} /> }
            </div>
        </>
    )
}

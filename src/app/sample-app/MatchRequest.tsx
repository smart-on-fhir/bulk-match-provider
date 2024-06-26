import { FormEvent } from "react"
import {
    State,
    StateModifier,
    abort,
    addRequest,
    kickOffError,
    kickOffStart,
    kickOffSuccess,
    updateKickOff,
    updateRequest
} from "./State"


export default function MatchRequest({ state, dispatch }: { state: State, dispatch: React.Dispatch<StateModifier> }) {
    const {
        matchRequest: {
            baseUrl,
            onlySingleMatch,
            onlyCertainMatches,
            count,
            resources,
        },
        statusURL,
        manifest,
        canceled
    } = state

    async function sendMatchRequest(e: FormEvent) {

        e.preventDefault()

        const url = new URL("Patient/$bulk-match", baseUrl + "")

        const body: fhir4.Parameters = {
            resourceType: "Parameters",
            parameter: []
        }

        try {
            var patients = JSON.parse(resources + "")
        } catch (error) {
            return dispatch(kickOffError(error))
        }

        if (patients) {
            patients.forEach((p: any) => body.parameter!.push({ name: "resource", resource: p }))
        }
    
        body.parameter!.push({ name: "onlySingleMatch"   , valueBoolean: onlySingleMatch    })
        body.parameter!.push({ name: "onlyCertainMatches", valueBoolean: onlyCertainMatches })
        
        if (count) {
            body.parameter!.push({ name: "count", valueInteger: count })
        }
    
        // if (_outputFormat) {
        //     body.parameter!.push({ name: "_outputFormat", valueString: _outputFormat })
        // }

        const fetchOptions = {
            method : "POST",
            body: JSON.stringify(body, null, 4),
            headers: {
                "Content-Type": "application/json",
                accept: "application/fhir+ndjson"
            }
        }

        dispatch(kickOffStart())

        dispatch(addRequest({
            id      : "kick-off-request",
            label   : "Kick-off Request",
            url     : url.toString(),
            loading : true,
            options : fetchOptions,
            requestBody: body
            // error  ?: Error | string | null
            // result ?: ConsumedResponse
        }))

        try {
            const res = await fetch(url, fetchOptions)

            const json = await res.json()
            
            dispatch(kickOffSuccess(res, json))
            dispatch(updateRequest("kick-off-request", {
                loading: false,
                error: null,
                result: {
                    response  : res,
                    payload   : json,
                    receivedAt: Date.now()
                }
            }))
            
        } catch (ex) {
            dispatch(kickOffError(ex))
            dispatch(updateRequest("kick-off-request", {
                loading: false,
                error: ex,
                result: {
                    // response  : res,
                    // payload   : json,
                    receivedAt: Date.now()
                }
            }))
        }
    }

    function cancel() {
        const options = { method: "DELETE" }
        dispatch(addRequest({
            id      : "cancelation-request",
            label   : "Cancelation Request",
            url     : statusURL,
            loading : true,
            options
        }))
        fetch(statusURL!, options).then(res => {
            return res.json().then(payload => {
                dispatch(updateRequest("cancelation-request", {
                    loading: false,
                    result: { response: res, payload }
                }))
                dispatch(abort())
            }, error => {
                dispatch(updateRequest("cancelation-request", {
                    loading: false,
                    error: error
                }))
            })
        })
    }

    return (
        <form onSubmit={sendMatchRequest} className="my-0">
            <div className="card mb-4 bg-light bg-opacity-50 bg-gradient shadow-sm">
                <div className="card-body pt-2">
                    <div className="row">
                        <div className="col">
                            <div className="row mt-2">
                                <div className="col">
                                    <div className="form-check">
                                        <label className="form-check-label text-success fw-bold">
                                            <input
                                                className="form-check-input"
                                                type="checkbox"
                                                checked={ onlySingleMatch }
                                                onChange={ e => dispatch(updateKickOff({ onlySingleMatch: e.target.checked })) }
                                            />
                                            Only Single Match
                                        </label>
                                        <div className="form-text mb-1 lh-sm">
                                            <small>
                                            If there are multiple potential matches, the server should identify the single
                                            most appropriate match that should be used with future interactions with the
                                            server (for example, as part of a subsequent create interaction).
                                            </small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="row mt-2">
                                <div className="col">
                                    <div className="form-check">
                                        <label className="form-check-label text-success fw-bold">
                                            <input
                                                className="form-check-input"
                                                type="checkbox"
                                                checked={ onlyCertainMatches }
                                                onChange={ e => dispatch(updateKickOff({ onlyCertainMatches: e.target.checked })) }
                                            />
                                            Only Certain Matches
                                        </label>
                                        <div className="form-text mb-1 lh-sm">
                                            <small>
                                            If there are multiple potential matches, the server should be certain that each
                                            of the records are for the same patient. This could happen if the records are
                                            duplicates, are the same person for the purpose of data segregation, or other reasons.
                                            When false, the server may return multiple results with each result graded accordingly.
                                            </small>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="row mt-2">
                                <div className="col">
                                    <label htmlFor="count" className="text-success fw-bold">Count</label>
                                    <input
                                        className="form-control"
                                        type="number"
                                        placeholder="count"
                                        id="count"
                                        min={1}
                                        value={ count || "" }
                                        onChange={ e => dispatch(updateKickOff({ count: e.target.valueAsNumber })) }
                                        disabled={ !!onlySingleMatch }
                                    />
                                    <div className="form-text mb-1 lh-sm">
                                        <small>
                                        The maximum number of records to return per resource.
                                        Be careful when using this, as it may prevent
                                        probable - and valid - matches from being returned.
                                        </small>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="col-lg-7 d-flex flex-column">
                            <label htmlFor="resources" className="text-success mt-2 fw-bold">Resources</label>
                            <div className="form-text mb-1 lh-sm"><small>Patients to search for as JSON Array</small></div>
                            <textarea
                                className="form-control flex-grow-1 form-control-sm"
                                rows={8}
                                id="resources"
                                value={ resources }
                                onChange={ e => dispatch(updateKickOff({ resources: e.target.value })) }
                                style={{ fontFamily: "monospace", fontSize: "80%" }}
                            />
                        </div>
                    </div>
                </div>
                <div className="border-top card-footer text-center">
                    <button className="btn btn-primary">
                        { manifest ? <>Resend <b>Bulk-Match</b> Request</> : <>Send <b>Bulk-Match</b> Request</> }
                    </button>
                    { statusURL && !canceled && <button
                        className="ms-2 px-4 btn btn-outline-danger"
                        type="button"
                        onClick={cancel}
                        >{ manifest ? "Delete Job" : "Cancel" }</button>
                    }
                </div>
            </div>
        </form>
    )
}

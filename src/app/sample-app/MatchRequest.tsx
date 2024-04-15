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
            <hr className="my-0" />
            <div className="row">
                <div className="col-lg-5">
                    <div className="row mt-4">
                        <div className="col">
                            <label htmlFor="baseUrl" className="text-success">Server Base URL</label>
                            <div className="form-text mb-1">FHIR server base URL (we will append <code>Patient/$bulk-match</code> to it)</div>
                            <input
                                className="form-control"
                                type="url"
                                id="baseUrl"
                                placeholder="Server Base URL"
                                value={baseUrl}
                                onChange={ e => dispatch(updateKickOff({ baseUrl: e.target.value })) }
                                readOnly
                            />
                        </div>
                    </div>
                    <div className="row mt-4">
                        <div className="col">
                            <div className="form-check">
                                <label className="form-check-label text-success">
                                    <input
                                        className="form-check-input"
                                        type="checkbox"
                                        checked={ onlySingleMatch }
                                        onChange={ e => dispatch(updateKickOff({ onlySingleMatch: e.target.checked })) }
                                    />
                                    Only Single Match
                                </label>
                            </div>
                        </div>
                        <div className="col">
                            <div className="form-check">
                                <label className="form-check-label text-success">
                                    <input
                                        className="form-check-input"
                                        type="checkbox"
                                        checked={ onlyCertainMatches }
                                        onChange={ e => dispatch(updateKickOff({ onlyCertainMatches: e.target.checked })) }
                                    />
                                    Only Certain Matches
                                </label>
                            </div>
                        </div>
                    </div>
                    <div className="row mt-4">
                        <div className="col">
                            <label htmlFor="count" className="text-success">Count</label>
                            <div className="form-text mb-1">
                                The maximum number of records to return per resource.
                                Be careful when using this, as it may prevent
                                probable - and valid - matches from being returned.
                            </div>
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
                        </div>
                    </div>
                </div>
                <div className="col-lg-7 d-flex flex-column mt-4">
                    <label htmlFor="resources" className="text-success">Resources</label>
                    <div className="form-text mb-1">Patients to search for as JSON Array</div>
                    <textarea
                        className="form-control flex-grow-1"
                        rows={8}
                        id="resources"
                        value={ resources }
                        onChange={ e => dispatch(updateKickOff({ resources: e.target.value })) }
                        style={{ fontFamily: "monospace", fontSize: "90%" }}
                    />
                </div>
            </div>
            
            <div className="row my-4">
                <div className="col">
                    <div className="text-center bg-light p-2 rounded-bottom">
                        <button className="btn btn-primary">
                            { manifest ? <>Resend <b>Bulk-Match</b> Request</> : <>Send <b>Bulk-Match</b> Request</> }
                        </button>
                        { statusURL && !canceled && <button
                            className="ms-2 px-4 btn btn-danger"
                            type="button"
                            onClick={cancel}
                            >{ manifest ? "Delete Job" : "Cancel" }</button>
                        }
                    </div>
                </div>
            </div>
        </form>
    )
}

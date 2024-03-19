import { FormEvent } from "react"


interface MatchRequestState {
    onlySingleMatch   : boolean
    onlyCertainMatches: boolean
    count            ?: number
    resources         : string//(Partial<fhir4.Patient>)[]
    baseUrl           : string
    // loading           : boolean
    // _outputFormat    ?: string
}

export default function MatchRequest({
    state,
    onChange,
    onSubmit
}: {
    state: MatchRequestState,
    onChange: (patch: Partial<MatchRequestState>) => void,
    onSubmit: (e: FormEvent) => Promise<any>
}) {
    const { baseUrl, onlySingleMatch, onlyCertainMatches, count, resources } = state
    return (
        <form onSubmit={onSubmit} className="my-0">
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
                                onChange={ e => onChange({ baseUrl: e.target.value }) }
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
                                        onChange={ e => onChange({ onlySingleMatch: e.target.checked }) }
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
                                        onChange={ e => onChange({ onlyCertainMatches: e.target.checked }) }
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
                                onChange={ e => onChange({ count: e.target.valueAsNumber }) }
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
                        onChange={ e => onChange({ resources: e.target.value }) }
                        style={{ fontFamily: "monospace", fontSize: "90%" }}
                    />
                </div>
            </div>
            
            <div className="row my-4">
                <div className="col">
                    <div className="text-center bg-light p-2 rounded-bottom">
                        <button className="btn btn-primary">Send <b>Bulk-Match</b> Request</button>
                    </div>
                </div>
            </div>
        </form>
    )
}

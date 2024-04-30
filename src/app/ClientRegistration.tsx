import { FormEvent, useState } from "react"
import ParamList from "./ParamList";
// import { BACKEND_BASE_URL } from "./State"
export const BACKEND_BASE_URL = process.env.NODE_ENV === "production" ?
    window.location.origin :
    "http://127.0.0.1:3456"

async function copy(txt: string) {
    try {
        await navigator.clipboard.writeText(txt);
    } catch (err) {
        console.error('Failed to copy text to clipboard:', err);
        alert('Failed to copy text to clipboard.');
    }
}

export default function ClientRegistration() {

    const [ jwksUrl    , setJwksUrl    ] = useState("")
    const [ jwks       , setJwks       ] = useState("")
    const [ jwksError  , setJwksError  ] = useState("")
    const [ err        , setErr        ] = useState("")
    const [ dur        , setDur        ] = useState(0)
    const [ loading    , setLoading    ] = useState(false)
    const [ error      , setError      ] = useState<Error | string | null>(null)
    const [ assertion  , setAssertion  ] = useState("")
    const [ matchServer, setMatchServer] = useState("")
    const [ keyType    , setKeyType    ] = useState<"url" | "inline" | "sample">("url")
    const [ sampleAlg  , setSampleAlg  ] = useState<"ES384" | "RS384">("ES384")
    const [ fakeMatches, setFakeMatches] = useState(0)
    const [ duplicates , setDuplicates ] = useState(0)
    const [ mode       , setMode       ] = useState<"normal" | "fake" | "remote">("normal")
    const [ headers    , setHeaders    ] = useState<[string, string][]>([])

    const cannotSubmit = !!(
        loading ||
        (keyType === "url" && !jwksUrl) ||
        (keyType === "inline" && (!jwks || jwksError)) 
    )

    function onSubmit(e: FormEvent) {
        e.preventDefault()
        setLoading(true)
        setError(null)

        let body = new URLSearchParams({ err, accessTokensExpireIn: dur + "" })

        if (keyType === "url") {
            body.set("jwks_url", jwksUrl)
        }
        else if (keyType === "inline") {
            body.set("jwks", JSON.stringify({keys:[JSON.parse(jwks)]}))
        }
        else if (keyType === "sample") {
            body.set("jwks_url", `${BACKEND_BASE_URL}/keys/${sampleAlg}.jwks.json`)
        }

        if (mode === "fake") {
            body.set("fakeMatches", fakeMatches + "")
            body.set("duplicates" , duplicates + "")
        } else if (mode === "remote") {
            body.set("matchServer", matchServer)
            body.set("matchHeaders", JSON.stringify(headers))
        }

        fetch("/auth/register", {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body
        })
        .then(res => {
            return res.text().then(txt => {
                if (!res.ok) {
                    throw txt
                }
                return txt
            })
        })
        .then(result => setAssertion(result))
        .catch(e => setError(e))
        .finally(() => setLoading(false))
    }

    function validateAndSetJwks(str: string) {
        setJwks(str)
        try {
            var json = JSON.parse(str)
        } catch {
            return setJwksError("Not a valid JSON")
        }

        if (!json || typeof json !== "object") {
            return setJwksError("Not a JSON object")
        }
        setJwksError("")
    }

    return (
        <form onSubmit={onSubmit} className="mb-5">
            { error && <div className="alert alert-danger">{ error + "" }</div> }
            
            <h5 className="text-primary"><i className="bi bi-shield-lock" /> Public Key</h5>
            <div className="my-2 bg-primary-subtle" style={{ height: 2 }} />
            <div className="row mt-3">
                <div className="col-lg-6 mb-5">
                    <div className="form-check mb-3">
                        <label className="form-check-label">
                            <input className="form-check-input" type="radio" name="keyType" checked={ keyType === "url" } onChange={() => setKeyType("url")} />
                            Fetch the key from JWKS URL (<b>recommended</b>)
                            <div className="form-text">Provide an URL to your JWKS containing your public key(s)</div>
                        </label>
                    </div>
                    <div className="form-check mb-3">
                        <label className="form-check-label">
                            <input className="form-check-input" type="radio" name="keyType" checked={ keyType === "inline" } onChange={() => setKeyType("inline")} />
                            Provide the key now
                            <div className="form-text">Register your public key as JWK</div>
                        </label>
                    </div>
                    <div className="form-check">
                        <label className="form-check-label">
                            <input className="form-check-input" type="radio" name="keyType" checked={ keyType === "sample" } onChange={() => setKeyType("sample")} />
                            Use our example keys
                            <div className="form-text">Use our sample pair of keys (<span className="text-danger">for quick testing only</span>)</div>
                        </label>
                    </div>
                </div>
                <div className="col-lg-6 mb-5">
                    { keyType === "url" && <>
                        <label htmlFor="jwks-url" className="form-label text-primary-emphasis">JWKS URL</label>
                        <input type="url" className="form-control" id="jwks-url" value={jwksUrl} onChange={e => setJwksUrl(e.target.value)} placeholder="https://yourdomain.com/your-public-jwks.json" />
                        <div className="form-text small">
                            This URL communicates the TLS-protected endpoint where the client's public JWK Set can
                            be found. This endpoint SHALL be accessible without client authentication or authorization.
                            Allows a client to rotate its own keys by updating the hosted content at the JWK Set URL and
                            avoids the need for the FHIR authorization server to maintain and protect the JWK Set.
                        </div>
                    </> }
                    { keyType === "inline" && <>
                        <div className="d-flex justify-content-between">
                            <label className="form-label text-primary-emphasis">Public Key JWK</label>
                            <div className="form-label text-danger"><small>{ jwks ? jwksError : "" }</small></div>
                        </div>
                        <textarea className="form-control form-control-sm font-monospace" rows={10} placeholder="{ Public Key as JWK }" style={{
                            whiteSpace: "pre",
                            lineHeight: 1.2,
                            fontSize: "13px"
                        }} value={jwks} onChange={e => validateAndSetJwks(e.target.value)} />
                    </> }
                    { keyType === "sample" && <>
                        <div className="input-group">
                            <span className="input-group-text">Key Type:</span>
                            <select className="form-select" value={sampleAlg} onChange={e => setSampleAlg(e.target.value as any)}>
                                <option value="ES384">ES384</option>
                                <option value="RS384">RS384</option>
                            </select>
                        </div>
                        <div className="form-text mt-3">
                            <i className="bi bi-info-circle-fill text-primary me-2" />
                            We will verify your token signature using the public key found at:
                            <ul>
                                <li><a href={`${BACKEND_BASE_URL}/keys/${sampleAlg}.jwks.json`} target="_blank" rel="noreferrer">{BACKEND_BASE_URL}/keys/{sampleAlg}.jwks.json</a></li>
                            </ul>
                            <i className="bi bi-info-circle-fill text-primary me-2" />
                            Your client must sign it's tokens with the private key found at:
                            <ul className="mb-0">
                                <li><a href={`${BACKEND_BASE_URL}/keys/${sampleAlg}.private.json`} target="_blank" rel="noreferrer">{BACKEND_BASE_URL}/keys/{sampleAlg}.private.json</a></li>
                                <li><a href={`${BACKEND_BASE_URL}/keys/${sampleAlg}.private.pem`} target="_blank" rel="noreferrer">{BACKEND_BASE_URL}/keys/{sampleAlg}.private.pem</a></li>
                            </ul>
                        </div>
                    </> }
                </div>
            </div>
            <h5 className="text-primary"><i className="bi bi-gear" /> Advanced</h5>
            <div className="my-2 bg-primary-subtle" style={{ height: 2 }} />
            <div className="mb-4 mt-3 row">
                <div className="col">
                    <label htmlFor="err" className="form-label text-primary-emphasis">Simulated Error</label>
                    <select className="form-select" value={err} onChange={e => setErr(e.target.value)}>
                        <option value="">None</option>
                        <optgroup label="During Authentication">
                            <option value="expired_registration_token">Expired client</option>
                            <option value="reg_invalid_scope">Invalid scope</option>
                            <option value="invalid_client">Invalid client</option>
                        </optgroup>
                        <optgroup label="During Access">
                            <option value="invalid_scope">Invalid scope</option>
                            <option value="invalid_access_token">Invalid access token</option>
                            <option value="expired_access_token">Expired access token</option>
                            <option value="unauthorized_client">Unauthorized client</option>
                            <option value="too_many_patient_params">Too many patient parameters at Kick-off request</option>
                            <option value="too_frequent_status_requests">Too frequent status requests</option>
                            <option value="transient_status_error">Job temporarily failing (transient error)</option>
                            <option value="file_not_found">File not found during download</option>
                        </optgroup>
                    </select>
                    <div className="form-text small">
                        Force the server to throw certain type of error in different
                        places (useful for manual testing).
                    </div>
                </div>
                <div className="col">
                    <label htmlFor="dur" className="form-label text-primary-emphasis">Access Token Lifetime</label>
                    <select className="form-select" value={dur} onChange={e => setDur(+e.target.value)}>
                        <option value={0}>Auto (whatever the client specified)</option>
                        <option value={1}>1 minute</option>
                        <option value={5}>5 minutes</option>
                        <option value={15}>15 minutes</option>
                        <option value={60}>1 hour</option>
                    </select>
                    <div className="form-text small">
                        Normally the client will determine how long should the
                        access token be issued for, but this setting will take
                        precedence if used.
                    </div>
                </div>
            </div>
            <div className="mb-2 mt-3 row">
                <div className="col">
                    <label className="form-label text-primary-emphasis">Match Mode</label>
                    <div className="btn-group w-100">
                        <button type="button" className={"btn" + (mode === "normal" ? " btn-outline-primary active" : " border-secondary border-opacity-25")} onClick={() => setMode("normal")}>Built-in Match</button>
                        <button type="button" className={"btn" + (mode === "fake"   ? " btn-outline-primary active" : " border-secondary border-opacity-25")} onClick={() => setMode("fake"  )}>Fake Match</button>
                        <button type="button" className={"btn" + (mode === "remote" ? " btn-outline-primary active" : " border-secondary border-opacity-25")} onClick={() => setMode("remote")}>Remote Match</button>
                    </div>
                </div>
            </div>
            { mode === "normal" && <div className="form-text small">
                Use our built-in match algorithm to emulate what would happen if you run this operations
                against a real match server.
            </div> }
            { mode === "fake" && <>
                <div className="form-text small">
                    In this mode you can submit some patients you are looking to match and we will pretend
                    that some of them have been successfully matched against our database, even though we
                    don't really have any matching done.
                </div>
                <div className="my-4 row">
                    <div className="col">
                        <div className="d-flex justify-content-between">
                            <label htmlFor="fakeMatches" className="text-primary-emphasis">Fake Matches</label>
                            <span>{fakeMatches}%</span>
                        </div>
                        <input type="range" id="fakeMatches" className="form-range" value={fakeMatches} onChange={e => setFakeMatches(e.target.valueAsNumber)} min={0} max={100} step={10} />
                    </div>
                    <div className="col">
                        <div className="d-flex justify-content-between">
                            <label htmlFor="fakeDuplicates" className="text-primary-emphasis">Fake Duplicates</label>
                            <span>{duplicates}%</span>
                        </div>
                        <input type="range" id="fakeDuplicates" className="form-range d-block" value={duplicates} onChange={e => setDuplicates(e.target.valueAsNumber)} min={0} max={50} step={5} />
                    </div>
                </div>
            </> }
            { mode === "remote" && <>
                <div className="form-text small">
                    In this mode we will proxy the patients you are looking for to a
                    remote FHIR server of your choosing. The remote FHIR server must
                    support the <code>Patient/$match</code> operation.
                </div>
                <div className="my-4">
                    <label htmlFor="err" className="form-label text-primary-emphasis">External Match Server</label>
                    <input type="url" className="form-control" value={matchServer} onChange={e => setMatchServer(e.target.value)} name="url" />
                    <div className="form-text small">
                        If provided we will proxy match requests to this FHIR server. Enter the
                        full base URL of the FHIR server and we will append <code>Patient/$match</code> to it.
                    </div>
                </div>
                <div className="d-flex justify-content-between align-items-center flex-wrap my-2 border-bottom border-2 py-1">
                    <label className="text-primary-emphasis">HTTP Headers</label>
                    <button className="btn btn-sm border-success text-success border-opacity-25 btn-light" type="button" onClick={() => setHeaders([ ...headers, ["", ""] ])}>
                        <i className="bi bi-plus-circle" /> Add Header
                    </button>
                </div>
                <div className="form-text small mb-1">
                    As an example, if you have an access token and want to
                    use it to authenticate add an <code>authorization</code> header
                    with value of "<code>Bearer {"{"}your-token{"}"}</code>".
                </div>
                <ParamList params={headers} onChange={headers => setHeaders([...headers])}/>
            </> }
            <div className="my-4 mt-5 bg-primary-subtle" style={{ height: 2 }} />
            <div className="mb-3 text-center">
                <button type="submit" className="btn btn-primary px-4 bg-gradient" disabled={cannotSubmit}>Register</button>
            </div>
            { !!assertion && <>
                <div className="d-flex justify-content-between mb-1">
                    <b className="text-primary-emphasis">Your Client ID:</b>
                    <span
                        className="copy-btn"
                        onClick={() => copy(assertion)}
                    >Copy <i className="bi bi-clipboard-check" /></span>
                </div>
                <textarea className="form-control text-primary-emphasis form-control-sm" rows={4} defaultValue={assertion} readOnly/>
            </> }
        </form>
    )
}
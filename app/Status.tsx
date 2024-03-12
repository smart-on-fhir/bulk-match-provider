import { useEffect, useReducer } from "react"
import Collapse                  from "./Collapse"
import { wait }                  from "../src/lib"
import { JSONObject, MatchManifest }         from ".."


interface StatusResult {
    statusHeading: string
    text         : string
    status       : number
    json        ?: JSONObject
}

interface StatusState {
    responses: StatusResult[]
    error: Error | string | null
}



function statusReducer(state: StatusState, action: { type: string, payload: any }) {
    if (action.type === "ADD_RESPONSE") {
        state.responses.push(action.payload)
    }
    return { ...state };
}


export default function Status({
    statusURL,
    onComplete
}: {
    statusURL: string
    onComplete: (manifest: MatchManifest) => void
}) {

    const [state, dispatch] = useReducer(statusReducer, {
        responses: [],
        error: null
    })
    
    useEffect(() => {
        waitForStatus(statusURL, response => {
            dispatch({ type: "ADD_RESPONSE", payload: response })
            if (response.status === 200) {
                onComplete(response.json as unknown as MatchManifest)
            }
        })
    }, [statusURL])

    // useEffect(() => {
    //     window.scrollTo({ top: 1_000_000 })
    // })

    return (
        <>
            { state.error && <b style={{ color: "red" }}>{ state.error + "" }</b> }
            { state.responses.map((r, i) => {
                return (
                    <Collapse key={i} header={ <h5 className="m-0">Status Request {i + 1}</h5> }>
                        <hr className="my-1" />
                        <div className="row">
                            <div className="col"><b>{r.statusHeading}</b></div>
                        </div>
                        <div className="row mb-4">
                            <div className="col">
                                <pre>{r.text}</pre>
                            </div>
                        </div>
                    </Collapse>
                )
            }) }
        </>
    )
}

async function waitForStatus(statusURL: string, onResponse: (response: StatusResult) => void) {
    const response = await checkStatus(statusURL)
    onResponse(response)
    if (response.status === 202) {
        await wait(1000)
        await waitForStatus(statusURL, onResponse)
    }
}

async function checkStatus(statusURL: string): Promise<StatusResult> {
    const res = await fetch(statusURL)

    const out: StatusResult = {
        statusHeading: res.status + " " + res.statusText,
        text         : "",
        status       : res.status
    }
    
    let txt = await res.text()
    if (txt && res.headers.get("content-type")?.match(/\bjson\b/)) {
        out.json = JSON.parse(txt)
        txt = JSON.stringify(out.json, null, 4)
    }
    
    let lines = []
    res.headers.forEach((value, key) => lines.push(`${key}: ${value}\n`))
    lines.push("\n")
    lines.push(txt)

    out.text = lines.join("")

    return out
}


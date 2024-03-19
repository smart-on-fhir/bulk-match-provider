import { useEffect, useReducer } from "react"
import ResponseView              from "./Response"
import { wait }                  from "../lib"
import { MatchManifest }         from "../.."


interface StatusResult {
    response     : Response
    payload        ?: any
}

interface StatusState {
    responses: StatusResult[]
    error: Error | string | null
    complete: boolean
}

function statusReducer(state: StatusState, action: { type: string, payload?: any }) {
    if (action.type === "ADD_RESPONSE") {
        state.responses.push(action.payload)
    }
    if (action.type === "FINISH") {
        return { ...state, complete: true };
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
        error: null,
        complete: false
    })
    
    useEffect(() => {
        waitForStatus(statusURL, response => {
            dispatch({ type: "ADD_RESPONSE", payload: response })
            if (response.response.status === 200) {
                onComplete(response.payload as unknown as MatchManifest)
            }
        }).then(() => {
            dispatch({ type: "FINISH" })
        })
    }, [statusURL])

    return (
        <>
            { state.error && <b style={{ color: "red" }}>{ state.error + "" }</b> }
            { state.responses.map((r, i) => {
                return <ResponseView response={r.response} payload={r.payload} heading={ "Status Request " + (i + 1) } key={i} />
            }) }
            { !state.complete && <div className="spinner-border text-secondary spinner-small" role="status"/> }
        </>
    )
}

async function waitForStatus(statusURL: string, onResponse: (response: StatusResult) => void) {
    const response = await checkStatus(statusURL)
    onResponse(response)
    if (response.response.status === 202) {
        await wait(1000)
        await waitForStatus(statusURL, onResponse)
    }
}

async function checkStatus(statusURL: string): Promise<StatusResult> {
    const res = await fetch(statusURL)

    const out: StatusResult = {
        response: res,
        payload: await res.text()
    }
    
    if (out.payload && res.headers.get("content-type")?.match(/\bjson\b/)) {
        out.payload = JSON.parse(out.payload)
    }

    return out
}

import { useEffect, useReducer } from "react"
import PresetSelector            from "./PresetSelector"
import Collapse                  from "./Collapse"
import MatchRequest              from "./MatchRequest"
import MatchResults              from "./MatchResults"
import RequestView               from "./Request"
import { wait }                  from "../../lib"
import { MatchManifest }         from "../../.."
import {
    ConsumedResponse,
    State,
    StateModifier,
    addRequest,
    initialState,
    merge,
    reducer,
    setPreset,
    updateRequest
} from "./State"
import "./style.scss"

// @ts-ignore
import logo from "../../../static/img/logo-light.svg"


export default function App() {
    const [state, dispatch] = useReducer(reducer, initialState);
    const {
        preset,
        statusURL,
        manifest,
        requests,
        tabIndex
    } = state;

    useEffect(() => {
        if (statusURL) waitForStatus(state, dispatch)
    }, [statusURL])

    return (
        <>
            <nav className="navbar sticky-top navbar-expand-lg bg-primary">
                <div className="container">
                    <a className="navbar-brand text-white" href="/">
                        <img src={logo} width="56" style={{ margin: "-20px 6px -20px 0" }} />
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
                        <PresetSelector value={preset} onChange={s => dispatch(setPreset(s))} />
                    </div>
                </div>
            </nav>
            <div className="container my-3">
                <Collapse header={ <h5 className="m-0">Bulk-Match Request</h5> } open>
                    <MatchRequest state={state} dispatch={dispatch} />
                </Collapse>
                { requests.map((r, i) => <RequestView request={r} key={i} />) }
                { manifest && <MatchResults manifest={manifest} /> }
            </div>
        </>
    )
}


async function waitForStatus(state: State, dispatch: React.Dispatch<StateModifier>, index: number = 1) {
    const result = await checkStatus(state, dispatch, index)

    if (result.response.status === 200) {
        dispatch(merge({ manifest: result.payload as MatchManifest }))
    }

    else if (result.response.status === 202) {
        await wait(1000)
        if (!state.canceled) {
            await waitForStatus(state, dispatch, index + 1)
        }
    }
    
    else if (result.response.status === 429) {
        const delay = +result.response.headers.get("retry-after")!
        if (delay && !isNaN(delay)) {
            await wait(delay * 1000)
            if (!state.canceled) {
                await waitForStatus(state, dispatch, index + 1)
            }
        }
    }
}

async function checkStatus(state: State, dispatch: React.Dispatch<StateModifier>, index: number): Promise<ConsumedResponse> {
    const id = "request-" + index
    const options = {
        headers: {
            accept: "application/json"
        }
    }
    
    dispatch(addRequest({
        id,
        label   : "Status Request " + index,
        url     : state.statusURL,
        loading : true,
        options
    }))

    const res = await fetch(state.statusURL, options)

    const out: ConsumedResponse = {
        response: res,
        payload: await res.text()
    }
    
    if (out.payload && res.headers.get("content-type")?.match(/\bjson\b/)) {
        out.payload = JSON.parse(out.payload + "")
    }

    dispatch(updateRequest(id, {
        loading: false,
        result: out
    }))

    return out
}

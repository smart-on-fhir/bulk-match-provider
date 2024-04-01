import { MatchManifest } from "../../.."
import { Preset } from "./presets"

export interface Request {
    id      : string
    label   : string
    url     : string
    loading?: boolean
    error  ?: Error | string | null
    options?: RequestInit
    result ?: ConsumedResponse
    requestBody?: string | null
}

export interface ConsumedResponse {
    response: Response
    payload: object | string | null
    error?: Error | string | null
    receivedAt?: number
}

export interface State {
    preset: Preset | null

    requests: Request[]

    matchRequest : {
        loading: boolean
        error: Error | string | null
        baseUrl: string
        onlySingleMatch: boolean
        onlyCertainMatches: boolean
        count: number
        resources: string
        response: ConsumedResponse | null
    },
    statusURL: string
    manifest: MatchManifest | null
    canceled?: boolean
    tabIndex: number
}

export const BACKEND_BASE_URL = process.env.NODE_ENV === "production" ? window.location.origin : "http://127.0.0.1:3456"

export const initialState: State = {
    preset: null,
    requests: [],
    matchRequest: {
        loading: false,
        error  : null,
        baseUrl: BACKEND_BASE_URL + "/fhir/",
        onlySingleMatch   : false,
        onlyCertainMatches: false,
        count             : 0,
        resources         : `[]`,
        response          : null
    },
    statusURL: "",
    manifest: null,
    canceled: false,
    tabIndex: 0
}

export type ActionCreator = (...args: any[]) => StateModifier
export type StateModifier = (state: State) => State

export const setPreset: ActionCreator = (preset: Preset) => {
    const resources = JSON.stringify(preset?.params.resources || [], null, 2)
    return (state: State) => ({
        ...state,
        preset,
        matchRequest: {
            ...initialState.matchRequest,
            onlySingleMatch   : preset?.params.onlySingleMatch    ?? initialState.matchRequest.onlySingleMatch,
            onlyCertainMatches: preset?.params.onlyCertainMatches ?? initialState.matchRequest.onlyCertainMatches,
            count             : preset?.params.count              ?? initialState.matchRequest.count,
            resources
        },
        statusURL: "",
        manifest: null,
        canceled: false,
        requests: []
    })
}

export const updateKickOff: ActionCreator = (params: Partial<State["matchRequest"]>) => {
    return (state: State) => ({
        ...state,
        matchRequest: {
            ...state.matchRequest,
            ...params
        }
    })
}

export const kickOffError: ActionCreator = (error: Error | string | null) => {
    return (state: State) => ({
        ...state,
        matchRequest: {
            ...state.matchRequest,
            error
        }
    })
}

export const kickOffStart: ActionCreator = () => {
    return (state: State) => ({
        ...state,
        statusURL: "",
        matchRequest: {
            ...state.matchRequest,
            error   : null,
            loading : true,
            response: null
        },
        manifest: null,
        canceled: false,
        requests: []
    })
}

export const kickOffSuccess: ActionCreator = (res: Response, responseJson: object | null) => {
    return (state: State) => ({
        ...state,
        statusURL: res.headers.get("content-location") || "",
        matchRequest: {
            ...state.matchRequest,
            error: null,
            loading: false,
            response: {
                response: res,
                payload: responseJson
            }
        }
    })
}

export const abort: ActionCreator = () => {
    return (state: State) => ({
        ...state,
        canceled: true
    })
}

export const addRequest: ActionCreator = (req: Request) => {
    return (state: State) => ({
        ...state,
        requests: [...state.requests, req]
    })
}

export const updateRequest: ActionCreator = (id: string, req: Partial<Request>) => {
    return (state: State) => {
        const requests = state.requests.map(r => {
            if (r.id === id) {
                return { ...r, ...req }
            }
            return { ...r }
        })
        return { ...state, requests }
    } 
}

export const merge: ActionCreator = (s: Partial<State>) => {
    return (state: State) => ({ ...state, ...s })
}

export function reducer(state: State, fn: StateModifier): State {
    const nextState = fn(state)
    // console.log(nextState)
    return nextState;
}

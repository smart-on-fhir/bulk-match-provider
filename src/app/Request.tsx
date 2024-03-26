import Collapse from "./Collapse"
import { Request } from "./State"


export default function RequestView({ request }: { request: Request }) {
    const {
        label,
        loading,
        error,
        options = {},
        url,
        result,
        requestBody
    } = request

    const responseHeaders = result?.response ?
        Object.fromEntries(result.response.headers.entries()) :
        {}

    const requestHeaders: any = options?.headers ?? {}

    const responsePayload = result?.payload

    return (
        <Collapse header={
            <>
            <h5 className="m-0">
                { label }
                { loading && <small className="spinner-border text-secondary spinner-border-sm mx-2" role="status"/> }
                
            </h5>
            { result && <b className={ "ms-2 badge my-0 " + (
                    result.response.status >= 200 && result.response.status < 300 ?
                        "text-success border-success-subtle border" :
                        result.response.status >= 300 && result.response.status < 400 ?
                            "text-info border-info-subtle border":
                            result.response.status >= 400 ?
                                "text-bg-danger" :
                                "text-secondary border-secondary-subtle border"
                )}>{result.response.status} {result.response.statusText}</b> }
            </>
        }>
            { error && <div className="alert alert-danger font-monospace small p-2 my-2">{ error + " test" }</div> }
            <b className="text-muted">Request:</b><hr className="my-1"/>
            <div className="mb-4 small">
                <code>{ options.method || "GET"} {url}</code><br/>
                <pre className="small">
                    <code className="language-http">{
                        Object.keys(requestHeaders).map(k => `${k}: ${requestHeaders[k]}`).join("\n")
                    }</code>
                    { requestBody ?
                        typeof requestBody === "object" ?
                        <code className="language-json d-block mt-4 small">{JSON.stringify(requestBody, null, 2)}</code> :
                        <code>{requestBody}</code> : null}
                </pre>
            </div>
            <b className="text-muted">Response:</b><hr className="my-1"/>
            <div className="small mb-4">
                { result ?
                    <pre>
                        <code className="language-http">{
                            Object.keys(responseHeaders).map(k => `${k}: ${responseHeaders[k]}`).join("\n")
                        }</code>
                        <br/>
                        <br/>
                        { responsePayload && typeof responsePayload === "object" ?
                            <code className="language-json">{JSON.stringify(responsePayload, null, 2)}</code> :
                            <code>{responsePayload}</code> }
                    </pre> :
                    <small className="spinner-border text-secondary spinner-border-sm mx-2" role="status"/>
                }
            </div>
        </Collapse>
    )
}
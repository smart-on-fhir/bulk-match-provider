import Collapse from "./Collapse"

export default function ResponseView({
    response,
    payload,
    heading
}: {
    response: Response
    payload?: any
    heading?: any
}) {
    const headers = Object.fromEntries(response.headers.entries())
    return (
        <Collapse header={
            <>
                <h5 className="m-0">{heading}</h5>
                <b className={ "ms-2 badge " + (
                    response.status >= 200 && response.status < 300 ?
                        "text-bg-success" :
                        response.status >= 300 && response.status < 400 ?
                            "text-bg-info":
                            response.status >= 400 ?
                                "text-bg-danger" :
                                "text-bg-secondary"
                )}>{response.status} {response.statusText}</b>
            </>
        }>
            <hr className="my-1" />
            <div className="small mb-4">
                <pre>
                    <code className="language-http">{
                        Object.keys(headers).map(k => `${k}: ${headers[k]}`).join("\n")
                    }</code>
                    <br/>
                    <br/>
                    { payload && typeof payload === "object" ?
                        <code className="language-json">{JSON.stringify(payload, null, 2)}</code> :
                        <code>{payload}</code> }
                </pre>
            </div>
        </Collapse>
    )
}
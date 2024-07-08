import { useEffect, useState } from "react"
import ClientRegistration      from "./ClientRegistration"
import ServerInfo              from "./ServerInfo"
import "./style.scss"

// @ts-ignore
import logo from "../../static/img/logo.svg"


export default function App() {
    const [tabIndex, setTabIndex] = useState(1);
    const [env, setEnv] = useState<Record<string, string|number>>({})

    const BACKEND_BASE_URL = process.env.NODE_ENV === "production" ?
        window.location.origin :
        "http://127.0.0.1:3456"
    
    useEffect(() => {
        fetch(BACKEND_BASE_URL + "/env")
            .then(res => res.json())
            .then(setEnv)
            .catch(console.error)
    }, [])
    
    return (
        <>
            <nav className="navbar sticky-top navbar-expand-lg bg-primary-subtle bg-gradient">
                <div className="container">
                    <h1 className="navbar-brand m-0">
                        <a className="navbar-brand text-primary-emphasis" href="/" style={{ textShadow: "0 1px 1px #FFF" }}>
                            {/* <i className="bi bi-fire me-1" /> */}
                            <img src={logo} width="66" style={{ margin: "-20px 6px -20px 0" }} />
                            Bulk Match Provider
                        </a>
                    </h1>
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
                        <ul className="nav nav-pills">
                            <li className="nav-item">
                                <a className={"nav-link" + (tabIndex === 1 ? " active bg-gradient" : "")} onClick={(e) => { e.preventDefault(); setTabIndex(1); }} href="#">Client Registration</a>
                            </li>
                            <li className="nav-item">
                                <a className={"nav-link" + (tabIndex === 0 ? " active bg-gradient" : "")} onClick={(e) => { e.preventDefault(); setTabIndex(0); }} href="#">Server Info</a>
                            </li>
                            <li className="nav-item">
                                <a className="nav-link" href="./sample-app" target="_blank">
                                    <b>Sample App<i className="bi bi-box-arrow-up-right ms-2" /></b>
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>
            </nav>
            <div className="container my-3">
                <div className="tab-content">
                    <div className={"tab-pane" + (tabIndex === 0 ? " show active" : "")} role="tabpanel" tabIndex={0}>
                        <ServerInfo />
                    </div>
                    <div className={"tab-pane" + (tabIndex === 1 ? " show active" : "")} role="tabpanel" tabIndex={0}>
                        <ClientRegistration />
                    </div>
                </div>
            </div>

            <div className="bg-light border border-top py-4">
                <div className="text-center small mb-2">
                    Submit an issue or PR on <a href="https://github.com/smart-on-fhir/bulk-match-provider" rel="noreferrer noopener" target="_blank">GitHub</a>.
                </div>
                <div className="text-center small">
                    <b> Version:</b> { env.VERSION }
                </div>
            </div>
        </>
    )
}

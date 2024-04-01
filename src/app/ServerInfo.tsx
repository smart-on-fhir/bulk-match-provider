// import { BACKEND_BASE_URL } from "./State";
export const BACKEND_BASE_URL = process.env.NODE_ENV === "production" ?
    window.location.origin :
    "http://127.0.0.1:3456"


function NewTabLink({ href }: { href: string }) {
    return (
        <a rel="noopener noreferrer" target="_blank" href={href}>
            { href }<i className="bi bi-box-arrow-up-right ms-2" />
        </a>
    )
}

export default function ServerInfo() {
    return (
        <div className="py-4">
            <dl>
                <dt><i className="bi bi-arrow-right-circle-fill text-success me-2" />Bulk Patient Matching Endpoint</dt>
                <dd className="mb-4">
                    <code>{ BACKEND_BASE_URL }/fhir/Patient/$bulk-match</code>
                    <div className="small text-secondary">
                        Use this to match your patients as described in the IG
                        at <NewTabLink href="https://build.fhir.org/ig/HL7/bulk-data/branches/bulk-match/match.html" />
                    </div>
                </dd>
                <dt><i className="bi bi-arrow-right-circle-fill text-success me-2" />Token Endpoint</dt>
                <dd className="mb-4">
                    <code>{ BACKEND_BASE_URL }/auth/token</code>
                    <div className="small text-secondary">
                        Send your authentication request here, as described in the
                        Backend Services IG at <NewTabLink href="https://www.hl7.org/fhir/smart-app-launch/backend-services.html" />
                    </div>
                </dd>
                <dt><i className="bi bi-arrow-right-circle-fill text-success me-2" />Well-Known SMART Configuration</dt>
                <dd className="mb-4">
                    <code><NewTabLink href={ BACKEND_BASE_URL  + "/.well-known/smart-configuration" }/></code>
                    <div className="small text-secondary">
                        This is not a real FHIR server. It is only used to
                        demonstrate how the bulk patient matching could work. As
                        such, we only provide the minimal set of properties in
                        our <code>.well-known/smart-configuration</code> so that
                        a client is able to auto-discover authentication-related
                        information.
                    </div>
                </dd>
                <dt><i className="bi bi-arrow-right-circle-fill text-success me-2" />Authentication Keys</dt>
                <dd className="mb-4">
                    <code><NewTabLink href={ BACKEND_BASE_URL  + "/keys" }/></code>
                    <div className="small text-secondary">
                        Since this is a reference implementation server and there
                        is no API for any data mutations, we publish our keys,
                        including the private ones. This is ONLY done to simplify
                        the process of connecting and testing!
                    </div>
                </dd>
                <dt><i className="bi bi-arrow-right-circle-fill text-success me-2" />Supported Sign Algorithms</dt>
                <dd className="mb-4">
                    <code>RS256</code>, <code>RS384</code>, <code>RS512</code>, <code>ES256</code>, <code>ES384</code>, <code>ES512</code>
                    <div className="small text-secondary">
                        You can sign your tokens with private keys using any of
                        these algorithms and the server should be able to verify
                        them using the corresponding public key.
                    </div>
                </dd>
                <dt><i className="bi bi-arrow-right-circle-fill text-success me-2" />Available Patients</dt>
                <dd className="mb-4">
                    <code>
                        <a href={ BACKEND_BASE_URL  + "/patients" }>
                            { BACKEND_BASE_URL }/patients<i className="bi bi-cloud-download ms-2" />
                        </a>
                    </code>
                    <div className="small text-secondary">
                        In case you need to look at the complete patients you are
                        searching through, you can download them as ndjson file.
                    </div>
                </dd>
                <dt><i className="bi bi-arrow-right-circle-fill text-success me-2" />List Current Match Jobs</dt>
                <dd className="mb-4">
                    <code><NewTabLink href={ BACKEND_BASE_URL  + "/jobs" }/></code>
                    <div className="small text-secondary">
                        Keep an eye on the current match jobs on the server (<span className="text-danger">DEPRECATED!</span>) 
                    </div>
                </dd>
                <dt><i className="bi bi-arrow-right-circle-fill text-success me-2" />Completed Jobs are Deleted After</dt>
                <dd className="mb-4">
                    <code>5 minutes</code>
                    <div className="small text-secondary">
                        Once a match job is completed you will have 5 minutes to
                        download the result before they are deleted.
                    </div>
                </dd>
                <dt><i className="bi bi-arrow-right-circle-fill text-success me-2" />Pending Jobs are Deleted After</dt>
                <dd className="mb-4">
                    <code>60 minutes</code>
                    <div className="small text-secondary">
                        If for whatever reason a match job is unable to complete
                        in one hour, iit will be deleted regardless of its current
                        status.
                    </div>
                </dd>
            </dl>
        </div>
    )
}
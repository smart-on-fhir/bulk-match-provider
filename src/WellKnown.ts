import { Request, Response } from "express"
import { getRequestBaseURL } from "./lib"
import config from "./config"


export function smartConfig(req: Request, res: Response) {
    const baseUrl = getRequestBaseURL(req)
    res.json({
        token_endpoint       : `${baseUrl}/auth/token`,
        registration_endpoint: `${baseUrl}/auth/register`,

        grant_types_supported: [
            "client_credentials"
        ],
        token_endpoint_auth_methods_supported: [
            "private_key_jwt"
        ],
        token_endpoint_auth_signing_alg_values_supported: config.supportedAlgorithms,
        scopes_supported: [
            "system/*.rs"
        ],
        capabilities: [
            "client-confidential-asymmetric",
            "permission-v2",
        ]
    })
}
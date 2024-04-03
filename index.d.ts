export type JSONScalar = string | number | boolean | null;
export type JSONArray  = JSONValue[];
export type JSONObject = { [ key: string ]: JSONValue };
export type JSONValue  = JSONScalar | JSONArray | JSONObject;

declare namespace app {

    /**
     * Represents the result of parsing the Parameters resource passed to the
     * $bulk-match operation
     */
    interface MatchOperationParams {
        resource: fhir4.ParametersParameter[]
        onlySingleMatch: boolean
        onlyCertainMatches: boolean
        count: number
        _outputFormat: string
    }

    interface MatchOperationOptions {

        /**
         * Would be good if the failed matches are the same in repeated requests
         * - maybe sort the resource ids and take from the top when deciding
         *   which ones to fail?
         */
        reflect?: {

            /**
             * Reflect annotated version of request back (test mode)
             */
            enabled: boolean

            /**
             * Select % matches fail in server settings
             */
            percentMatch?: number
          
            /**
             * Select % matches that have multiple results ({last name}_1,
             * {last_name}_2) in server settings
             */
            percentMulti?: number
        }

        /**
         * Proxy match requests to a FHIR server supporting  single patient
         * match.
         */
        matchServer?: string
    }

    interface MatchManifest {
        
        /**
         * FHIR instant
         * Indicates the server's time when the query is run. The response
         * SHOULD NOT include any resources modified after this instant, and
         * SHALL include any matching resources modified up to and including
         * this instant.
         * 
         * Note: To properly meet these constraints, a FHIR server might need to
         * wait for any pending transactions to resolve in its database before
         * starting the export process.
         */
        transactionTime: string

        /**
         * The full URL of the original Bulk Match kick-off request. This URL
         * will not include the request parameters and may be removed in a
         * future version of this IG.
         */
        request: string

        /**
         * Indicates whether downloading the generated files requires the same
         * authorization mechanism as the $bulk-match operation itself.
         * 
         * Value SHALL be true if both the file server and the FHIR API server
         * control access using OAuth 2.0 bearer tokens. Value MAY be false for
         * file servers that use access-control schemes other than OAuth 2.0,
         * such as downloads from Amazon S3 bucket URLs or verifiable file
         * servers within an organization's firewall.
         */
        requiresAccessToken: boolean

        /**
         * An array of file items with one entry for each generated file. If no
         * resources are returned, the server SHOULD return an empty array.
         */
        output: MatchManifestOutputEntry[]

        /**
         * Empty array. To align with the single patient match operation, error,
         * warning, and information messages related to matches SHOULD be
         * included in the match bundles in files in the output array.
         */
        error: []

        /**
         * To support extensions, this implementation guide reserves the name
         * extension and will never define a field with that name, allowing
         * server implementations to use it to provide custom behavior and
         * information. For example, a server may choose to provide a custom
         * extension that contains a decryption key for encrypted ndjson files.
         * The value of an extension element SHALL be a pre-coordinated JSON
         * object.
         * 
         * Note: In addition to extensions being supported on the root object
         * level, extensions may also be included within the fields above (e.g.,
         * in the 'output' object).
         */
        extension?: JSONObject
    }

    interface MatchManifestOutputEntry {
        /**
         * Fixed value of "Bundle"
         */
        type: "Bundle"

        /**
         * The absolute path to the file. The format of the file SHOULD reflect
         * that requested in the _outputFormat parameter of the initial kick-off
         * request.
         */
        url: string

        /**
         * The number of resources in the file, represented as a JSON number.
         * 
         * The number of FHIR searchset Bundle resources per file MAY vary
         * between servers.
         */
        count?: number 
    }

    type OAuthErrorType =
        
        /**
         * The request is missing a required parameter, includes an unsupported
         * parameter value (other than grant type), repeats a parameter,
         * includes multiple credentials, utilizes more than one mechanism for
         * authenticating the client, or is otherwise malformed.
         */
        "invalid_request" |

        /**
         * Client authentication failed (e.g., unknown client, no client
         * authentication included, or unsupported authentication method). The
         * authorization server MAY return an HTTP 401 (Unauthorized) status
         * code to indicate which HTTP authentication schemes are supported. If
         * the client attempted to authenticate via the "Authorization" request
         * header field, the authorization server MUST respond with an HTTP 401
         * (Unauthorized) status code and include the "WWW-Authenticate"
         * response header field matching the authentication scheme used by the
         * client.
         */
        "invalid_client" |

        /**
         * The provided authorization grant (e.g., authorization code, resource
         * owner credentials) or refresh token is invalid, expired, revoked,
         * does not match the redirection URI used in the authorization request,
         * or was issued to another client.
         */
        "invalid_grant" |

        /**
         * The authenticated client is not authorized to use this authorization
         * grant type.
         */
        "unauthorized_client" |

        /**
         * The authorization grant type is not supported by the authorization
         * server.
         */
        "unsupported_grant_type" |

        /**
         * The requested scope is invalid, unknown, malformed, or exceeds the
         * scope granted by the resource owner.
         */
        "invalid_scope";


}

export = app;

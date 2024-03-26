import "dotenv/config"
import { Server }                                   from "http"
import cors                                         from "cors"
import express, { json }                            from "express"
import type { NextFunction, Request, Response }     from "express"
import { join }                                     from "path"
import config                                       from "./config"
import { HttpError, InternalServerError, NotFound } from "./HttpError"
import { startChecking }                            from "./JobManager"
import { asyncRouteWrap, createOperationOutcome }   from "./lib"
import * as Gateway                                 from "./Gateway"
import { router as FHIRRouter }                     from "./fhir" 
import { smartConfig }                              from "./WellKnown"
import { keyGenerator }                             from "./keyGenerator"


const app = express()

app.use(cors({ origin: true, credentials: true }))
// app.use(urlencoded({ extended: false, limit: "64kb" }));

// Automatically parse incoming JSON payloads
app.use(json());

if (config.throttle) {
    app.use((_rec, _res, next: NextFunction) => setTimeout(next, config.throttle));
}

// .well-known/smart-configuration
app.get("/.well-known/smart-configuration", smartConfig)

app.get("/generate-jwk", keyGenerator)

// bulk-match and other fhir endpoints
app.use(["/:sim/fhir", "/fhir"], FHIRRouter)

// get job status
app.get(["/:sim/jobs/:id/status", "/jobs/:id/status"], asyncRouteWrap(Gateway.checkStatus))

// abort/delete job (bulk data like)
app.delete(["/:sim/jobs/:id/status", "/jobs/:id/status"], asyncRouteWrap(Gateway.abort))

// download bulk file
app.get(["/:sim/jobs/:id/files/:file", "/jobs/:id/files/:file"], asyncRouteWrap(Gateway.downloadFile))

// proprietary: view job by ID
app.get("/jobs/:id", asyncRouteWrap(Gateway.getJob))

// proprietary: list all jobs
app.get("/jobs", asyncRouteWrap(Gateway.listJobs))

// Static files for the web app
app.use(express.static(join(__dirname, "../dist/")));

// The web app
app.get(["/", "/index.html"], (req, res) => res.sendFile("index.html", { root: join(__dirname, "../dist/") }));

// Global error 404 handler
app.use((req: Request, res: Response) => {
    res.status(404).json(new NotFound())
});

// Global error handler
app.use((error: any, req: Request, res: Response, next: NextFunction) => {

    if (!(error instanceof HttpError)) {
        error = new InternalServerError({ cause: error })
    }
    
    /* istanbul ignore next */
    if (process.env.NODE_ENV !== "test") console.error(error);
    /* istanbul ignore next */

    res.status(error.statusCode).json(createOperationOutcome(error.message, {
        issueCode: error.statusCode
    }))
})



async function main(): Promise<{
    address: string;
    server: Server;
    app: Express.Application;
}> {
    return new Promise(resolve => {
        const server = app.listen(+config.port, config.host, () => {
            let address = server.address() || ""
            if (address && typeof address === "object") { // AddressInfo
                address = `http://${address.address}:${address.port}`
            }
            
            if (process.env.NODE_ENV !== "test") {
                startChecking() // periodically delete expired jobs
            }

            resolve({ server, app, address })
        });
    })
}

// istanbul ignore next
if (require.main === module) {
    main().then(({ address }) => console.log(`Server listening at ${address}`));
}

export default main;

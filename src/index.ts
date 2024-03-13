import "dotenv/config"
import { Server }                                   from "http"
import cors                                         from "cors"
import express, { json }                            from "express"
import type { NextFunction, Request, Response }     from "express"
import config                                       from "./config"
import { HttpError, InternalServerError, NotFound } from "./HttpError"
import { startChecking }                            from "./JobManager"
import { asyncRouteWrap }                           from "./lib"
import * as Gateway                                 from "./Gateway"
import { join }                                     from "path"


const app = express()

app.use(cors({ origin: true, credentials: true }))
// app.use(urlencoded({ extended: false, limit: "64kb" }));
app.use(json());


// bulk-match
app.post("/fhir/Patient/\\$bulk-match", asyncRouteWrap(Gateway.kickOff))

// get job status
app.get("/jobs/:id/status", asyncRouteWrap(Gateway.checkStatus))

// abort/delete job (bulk data like)
app.delete("/jobs/:id/status", asyncRouteWrap(Gateway.abort))

// download bulk file
app.get("/jobs/:id/files/:file", asyncRouteWrap(Gateway.downloadFile))

// Proprietary for debug: view job by ID
app.get("/jobs/:id", asyncRouteWrap(Gateway.getJob))

// Proprietary for debug: list all jobs
app.get("/jobs", asyncRouteWrap(Gateway.listJobs))

app.use(express.static(join(__dirname, "../dist/")));
app.get("*", (req, res) => res.sendFile("index.html", { root: join(__dirname, "../dist/") }));

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
    if (process.env.NODE_ENV === "development") console.error(error);
    /* istanbul ignore next */

    res.status(error.statusCode).json(error)
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

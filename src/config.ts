import Path     from "path"
import { uInt } from "./lib"


const { env } = process

export default {

    // The port to listen on. Defaults to `0` for system-allocated port
    port: env.PORT || 0,

    // The host to listen on. If not set defaults to "0.0.0.0"
    host: env.HOST || "0.0.0.0",

    // We use this to sign our tokens
    jwtSecret: env.SECRET || "this is our patient matching secret",

    // Default access token lifetime in minutes
    accessTokenLifetime: env.ACCESS_TOKEN_LIFETIME || 60,

    // Default refresh token lifetime in minutes
    refreshTokenLifeTime: env.REFRESH_TOKEN_LIFETIME || 60 * 24 * 365,
    
    // Accept JWKs using the following algorithms
    supportedAlgorithms: ["RS256", "RS384", "RS512", "ES256", "ES384", "ES512"],

    // Keep jobs for how long (minutes since creation)?
    jobMaxLifetimeMinutes: uInt(env.JOB_MAX_LIFETIME_MINUTES, 60),

    // Keep completed jobs for how long (minutes since completion)?
    completedJobLifetimeMinutes: uInt(env.COMPLETED_JOB_LIFETIME_MINUTES, 5),

    // Check for old jobs once every ? minutes
    jobCleanupMinutes: uInt(env.JOB_CLEANUP_MINUTES, 5),

    // MS to wait before matching each input patient. This is useful for slowing
    // down matches to make them look more realistic, as well as to have a
    // predictable durations while testing
    jobThrottle: uInt(env.JOB_THROTTLE, 1000),

    // Use different location for test jobs
    jobsDir: Path.join(__dirname, "..", env.NODE_ENV === "test" ? "test-jobs/" : "jobs/"),

    // Limits the number of instances of the resource parameter in a kickoff request
    resourceParameterLimit: 100
}

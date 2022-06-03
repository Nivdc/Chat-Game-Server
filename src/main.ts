import { serve } from "../models/dev_deps.ts";
import { router } from "./router.ts"

serve(router, { port: 3000 })
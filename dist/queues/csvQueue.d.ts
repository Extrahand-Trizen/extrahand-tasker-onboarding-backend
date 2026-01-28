import { Queue, Job } from "bullmq";
declare function getCsvQueue(): Queue;
export declare const csvQueue: {
    get: typeof getCsvQueue;
    add: (name: string, data: any, opts?: import("bullmq").JobsOptions | undefined) => Promise<Job<any, any, string>>;
    getJob: (jobId: string) => Promise<Job<any, any, string> | undefined>;
};
export default csvQueue;
//# sourceMappingURL=csvQueue.d.ts.map
# Literature Experiment Map

This table converts the reviewed papers into a final-review-ready comparison focused on experiment design and conclusion style.

| Paper | Experiment style | Metrics reported | Node/load scaling? | Safe use in MedLedger review |
| --- | --- | --- | --- | --- |
| Block MedCare (2024) | Usability survey + functional prototype | Survey responses, perceived interoperability, adoption concerns | No node-scaling benchmark | Use as support for problem relevance and usability interest, not for performance comparison |
| Chelladurai & Pandian (2021) | System performance evaluation | CPU utilization, memory usage, response time, throughput | General system load, not explicit validator-count graph | Closest match if you want to discuss response-time and throughput style experiments |
| Aljaloud & Razzaq (2023) | Cost and query-efficiency analysis | Contract creation cost, transaction cost, query time | No explicit node-count scaling | Useful when defending gas-cost and deployment-cost discussion |
| Shuaib et al. (2022) | Comparative blockchain benchmark under load | Latency, throughput, failure rate | Yes, performance under increased load and validator participation | This is the strongest source for the nodes/load-versus-latency style benchmark |
| Bhandari et al. (2023) | Functional deployment and gas-cost observation | Activity gas costs, successful testnet workflow | No explicit scaling benchmark | Use when discussing decentralized storage and transaction-cost evidence |
| HealthChain (2024) | Framework comparison with reported latency/throughput/security | Latency, throughput, interoperability, breach reduction claims | Yes, framed as scalability and attack stability | Use as a feature/scalability reference, but avoid direct apples-to-apples numeric comparison |
| Tahir et al. (2024) | Cost, response time, throughput, security analysis | Transaction cost, response time, throughput, vulnerability findings | Load-handling discussion, not a strict node-count benchmark | Useful for concluding that blockchain EHR evaluation often combines performance and security framing |

## Recommended Positioning For MedLedger

- Say that prior work commonly reports latency, throughput, gas/cost, resource usage, or usability evidence.
- Say that explicit node-versus-latency evidence usually comes from permissioned multi-node testbeds, not single-node local prototypes.
- Position MedLedger as providing measured prototype evidence, workflow-security improvements, and simulation-based scaling discussion.

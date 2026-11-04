import type { Option } from "./search";

/** Technologies people commonly list on a CV, in their usual spelling. Anything else can still be typed. */
const NAMES = `JavaScript|TypeScript|Python|Java|Kotlin|Scala|Groovy|C|C++|C#|F#|Go|Rust|Ruby|PHP|Swift|Objective-C|Dart|Elixir|Erlang|Haskell|Clojure|Lua|Perl|R|Julia|MATLAB|Bash|PowerShell|SQL|PL/SQL|T-SQL|COBOL|Fortran|Visual Basic|VBA|Assembly|Solidity|Zig|Crystal|Nim|OCaml|Delphi
Node.js|Deno|Bun|Express|NestJS|Fastify|Koa|Hapi|Next.js|Nuxt|Remix|Astro|SvelteKit|Gatsby|Vite|Webpack|Rollup|esbuild|Babel|tRPC|GraphQL|Apollo|REST|gRPC|WebSocket|Socket.IO|OpenAPI|Swagger|Prisma|TypeORM|Sequelize|Drizzle|Knex|Mongoose|Hibernate|JPA|MyBatis
React|React Native|Redux|Zustand|MobX|TanStack Query|React Router|Vue.js|Vuex|Pinia|Angular|RxJS|NgRx|Svelte|Solid|Preact|Alpine.js|jQuery|Backbone|Ember|Lit|Stencil|HTMX|Web Components|Electron|Tauri|Ionic|Capacitor|Cordova|Flutter|Expo|Xamarin|MAUI|SwiftUI|UIKit|Jetpack Compose|Android|iOS
HTML|CSS|Sass|Less|Tailwind CSS|Bootstrap|Material UI|Chakra UI|Ant Design|shadcn/ui|Styled Components|Emotion|Storybook|Figma|Three.js|D3.js|Chart.js|WebGL|Canvas|SVG|PWA|Webpack Module Federation|Micro Frontends
Spring|Spring Boot|Spring Cloud|Quarkus|Micronaut|Jakarta EE|Maven|Gradle|JUnit|Mockito|Ktor|Play Framework|Akka
Django|Django REST Framework|Flask|FastAPI|Celery|Pydantic|SQLAlchemy|Pandas|NumPy|SciPy|Scikit-learn|TensorFlow|PyTorch|Keras|Jupyter|Airflow|dbt|Spark|PySpark|Hadoop|Kafka Streams|Flink|Beam|Polars|Streamlit|Gradio
Ruby on Rails|Sinatra|Laravel|Symfony|CodeIgniter|WordPress|Drupal|Magento|Shopify|WooCommerce|Strapi|Contentful|Sanity|Directus
.NET|ASP.NET|ASP.NET Core|Entity Framework|Blazor|WPF|WinForms|LINQ|SignalR|NuGet
Gin|Echo|Fiber|Actix|Tokio|Axum|Rocket|Phoenix|LiveView
PostgreSQL|MySQL|MariaDB|SQLite|SQL Server|Oracle|MongoDB|Redis|Memcached|DynamoDB|Cassandra|ScyllaDB|CouchDB|Couchbase|Neo4j|ArangoDB|InfluxDB|TimescaleDB|ClickHouse|Snowflake|BigQuery|Redshift|Databricks|Elasticsearch|OpenSearch|Solr|Algolia|Firebase|Firestore|Supabase|PlanetScale|CockroachDB|Pinecone|pgvector|Weaviate|Qdrant
Kafka|RabbitMQ|ActiveMQ|NATS|SQS|SNS|Pub/Sub|EventBridge|BullMQ|Sidekiq|Temporal|Step Functions
AWS|EC2|S3|Lambda|ECS|EKS|Fargate|RDS|Aurora|CloudFront|Route 53|IAM|VPC|CloudWatch|CloudFormation|CDK|Cognito|API Gateway|Amplify|Elastic Beanstalk|Azure|Azure DevOps|Azure Functions|AKS|Google Cloud|GKE|Cloud Run|Cloud Functions|Vercel|Netlify|Heroku|DigitalOcean|Cloudflare|Cloudflare Workers|Fly.io|Render|Railway
Docker|Docker Compose|Kubernetes|Helm|Terraform|Pulumi|Ansible|Chef|Puppet|Vagrant|Packer|Argo CD|Flux|Istio|Envoy|Nginx|Apache|Caddy|HAProxy|Traefik|Linux|Ubuntu|Debian|CentOS|Red Hat|Windows Server|macOS
Git|GitHub|GitHub Actions|GitLab|GitLab CI|Bitbucket|Jenkins|CircleCI|Travis CI|TeamCity|Bamboo|SonarQube|Nexus|Artifactory|Jira|Confluence|Trello|Notion|Linear|Slack|Postman|Insomnia
Prometheus|Grafana|Loki|Tempo|Jaeger|OpenTelemetry|Datadog|New Relic|Sentry|ELK Stack|Splunk|PagerDuty|Nagios|Zabbix
Jest|Vitest|Mocha|Chai|Jasmine|Cypress|Playwright|Selenium|Puppeteer|Testing Library|Supertest|k6|JMeter|Locust|Pytest|RSpec|PHPUnit|xUnit|NUnit|Cucumber|TDD|BDD
OAuth|OpenID Connect|JWT|SAML|SSO|Keycloak|Auth0|Okta|Passport.js|OWASP|TLS|PKI|Vault|SIEM|Burp Suite|Nmap|Wireshark|Metasploit
n8n|Zapier|Make|Power Automate|UiPath|Airtable|Retool|Power BI|Tableau|Looker|Metabase|Superset|Excel|Google Sheets|Salesforce|HubSpot|SAP|ServiceNow|Odoo
OpenAI API|Claude API|LangChain|LlamaIndex|Hugging Face|Transformers|RAG|Prompt Engineering|MLflow|Kubeflow|ONNX|OpenCV|NLP|Computer Vision|LLM
Unity|Unreal Engine|Godot|OpenGL|Vulkan|DirectX|ROS|Arduino|Raspberry Pi|Embedded C|FreeRTOS|MQTT|Modbus|CAN bus|PLC|FPGA|Verilog|VHDL
Microservices|Monolith|Domain-Driven Design|Hexagonal Architecture|Clean Architecture|CQRS|Event Sourcing|Event-Driven Architecture|Serverless|Design Patterns|SOLID|API Design|System Design|CI/CD|DevOps|SRE|Infrastructure as Code|Agile|Scrum|Kanban|Code Review`;

export const STACK_CATALOG: readonly string[] = [...new Set(NAMES.split(/[|\n]/).map((name) => name.trim()).filter(Boolean))];

export const STACK_OPTIONS: readonly Option[] = STACK_CATALOG.map((name) => ({ value: name, label: name }));

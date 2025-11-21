🗳️ CloudVote Enterprise: Distributed Consensus System

CloudVote is a high-availability, distributed voting application designed to benchmark database write latency and replication consistency across AWS Availability Zones.

It features a "Glassmorphism" UI for real-time visualization of database transactions and pod load balancing.

🏗️ Architecture

The system is deployed on AWS EKS using a decoupled microservices architecture:

Ingress: AWS Application Load Balancer (ALB) with IP-mode targeting.

Compute: Node.js Replicas (Stateless) with Anti-Affinity rules.

Data: MySQL 8.0 StatefulSet backed by AWS EBS gp3 volumes.

Security: AWS Secrets Manager integration via External Secrets Operator.

✨ Key Features

Real-Time Sync: Uses AJAX polling to synchronize voting state across distributed clients instantly.

Audit Telemetry: Visualizes the specific Pod ID handling each transaction to prove load balancing efficiency.

Zero-Downtime: Configured with readinessProbes and livenessProbes for seamless rolling updates.

Resource Optimization: Tuned for t3.small constraints using precise resource requests and taint management.

🚀 Quick Start

Prerequisites

AWS EKS Cluster

kubectl, helm, and eksctl installed.

AWS Load Balancer Controller installed on the cluster.

Installation

1. Deploy Secrets & Database

kubectl apply -f k8s/01-secrets/
kubectl apply -f k8s/02-database/


2. Initialize Schema (One-time)

kubectl exec -it mysql-statefulset-0 -- mysql -u root -p -e "CREATE DATABASE my_app_db;"


3. Deploy Ingress & Application

kubectl apply -f k8s/03-ingress/
kubectl apply -f k8s/04-application/


4. Verify Status

kubectl get ingress
- Open the ADDRESS URL in your browser

🗳️ CloudVote Enterprise: Distributed Consensus System

... (rest of the file content) ...

📄 Live Documentation

The complete architectural whitepaper, including all Kubernetes manifests and the detailed architecture diagram, is hosted on a dedicated AWS EC2 t2.micro instance using a lightweight Docker/Nginx container.
URL: http://3.90.216.139:80

Architected by Soulayman Jazouli

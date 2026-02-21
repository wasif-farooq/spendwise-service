#!/bin/bash

echo "Creating Kafka topics..."

topics=(
  "auth-events"
  "user-events" 
  "notification-events"
)

for topic in "${topics[@]}"; do
  echo "Creating topic: $topic"
  docker exec spendwise-backend-kafka-1 kafka-topics --create --if-not-exists --bootstrap-server localhost:9092 --topic "$topic" --partitions 3 --replication-factor 1
done

echo "Topics created successfully."

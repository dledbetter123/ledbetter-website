#!/bin/bash

export AWS_REGION="us-east-1"
export CLUSTER_NAME="LedbetterWebsiteCluster"
export ECR_REPOSITORY_BASE="288994457841.dkr.ecr.us-east-1.amazonaws.com/"
export IMAGE_TAG=$(date +%Y%m%d%H%M)
export BACKEND_FAMILY="ledbetter-website-backend"
export FRONTEND_FAMILY="ledbetter-website-frontend"

export BACKEND_PORT_MAPPING="8080:8080"
export BACKEND_CPU="1024"
export BACKEND_MEMORY="2048"
export BACKEND_MEMORY_RES="1536"
export BACKEND_C_PORT="8080"
export BACKEND_H_PORT="8080"

export FRONTEND_PORT_MAPPING="80:80"
export FRONTEND_CPU="1024"
export FRONTEND_MEMORY="2048"
export FRONTEND_MEMORY_RES="1536"
export FRONTEND_C_PORT="80"
export FRONTEND_H_PORT="80"

# auth
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REPOSITORY_BASE

# docker compose builds and tags the frontend and backend images
docker-compose build

docker-compose push

deploy_service() {
  local service_name=$1
  local task_family=$2
  local container_name=$3
  local cpu=$4
  local memory=$5
  local memoryres=$6
  local environment_variables_json=$7
  local cport=$8
  local hport=$9

  local image="$ECR_REPOSITORY_BASE$container_name:$IMAGE_TAG"
  local portmapname="$container_name-$HPORT-tcp"
  local awslogsgroup="/ecs/$container_name"
  if [[ "$container_name" == "ledbetter-website-frontend" ]]; then
      # Prepare the entryPoint and command JSON
      entry_point_and_command_json=$(jq -n \
          --arg cmd "/entrypoint.sh" \
          '{
              "entryPoint": ["sh", "-c"],
              "command": [$cmd]
          }'
      )
  else
      # Prepare a JSON object without entryPoint and command
      entry_point_and_command_json="{}"
  fi
  # task definition
  local task_def_json=$(jq -n \
    --arg NAME "$container_name" \
    --arg IMAGE "$image" \
    --arg CPU "$cpu" \
    --arg MEMORY "$memory" \
    --arg MEMORYRES "$memoryres" \
    --arg CPORT "$cport" \
    --arg HPORT "$hport" \
    --argjson ENV_VARS "$environment_variables_json" \
    --arg TASK_FAMILY "$task_family" \
    --arg PORTMAPNAME "$portmapname" \
    --arg LOGGROUP "$awslogsgroup" \
    '{
        family: $TASK_FAMILY,
        requiresCompatibilities: ["FARGATE"],
        networkMode: "awsvpc",
        executionRoleArn: "arn:aws:iam::288994457841:role/ecsTaskExecutionRole",
        containerDefinitions: [
        {
            name: $TASK_FAMILY,
            image: $IMAGE,
            cpu: ($CPU | tonumber),
            memory: ($MEMORY | tonumber),
            memoryReservation: ($MEMORYRES | tonumber),
            essential: true,
            portMappings: [
            {
                name: $PORTMAPNAME,
                containerPort: ($CPORT | tonumber),
                hostPort: ($HPORT | tonumber),
                protocol: "tcp",
                appProtocol: "http"
            }
            ],
            environment: $ENV_VARS,
            logConfiguration: {
                logDriver: "awslogs",
                options: {
                    "awslogs-create-group": "true",
                    "awslogs-group": $LOGGROUP,
                    "awslogs-region": "us-east-1",
                    "awslogs-stream-prefix": "ecs"
                },
                "secretOptions": []
            }
        }
        ],
        ephemeralStorage: {
            "sizeInGiB": 21
        },
        runtimePlatform: {
            "cpuArchitecture": "ARM64",
            "operatingSystemFamily": "LINUX"
        },
        cpu: $CPU,
        memory: $MEMORY
    }')

  task_def_json=$(jq \
    --argjson epcmd "$entry_point_and_command_json" \
    '.containerDefinitions[0] += $epcmd' <<<"$task_def_json")

  new_task_definition_arn=$(aws ecs register-task-definition --cli-input-json "$task_def_json" --query 'taskDefinition.taskDefinitionArn' --output text)

  # update ecs
  aws ecs update-service --cluster $CLUSTER_NAME --service $service_name --task-definition $new_task_definition_arn
  echo "Updated $service_name to use $image"
}

backend_env_vars='[{"name":"ALLOWED_ORIGINS","value":"http://dualstack.ledbetter-website-lb-1790002270.us-east-1.elb.amazonaws.com,http://www.davidamosledbetter.com,https://www.davidamosledbetter.com"}]'

frontend_env_vars='[{"name":"REACT_APP_BACKEND_URI","value":"http://ledbetter-website-backend-lb-549200293.us-east-1.elb.amazonaws.com"}]'

# yes yes, task family and container name should be the same!!! ($BACKEND_FAMILY)
deploy_service "ledbetter-website-backend-service-2" $BACKEND_FAMILY $BACKEND_FAMILY "$BACKEND_CPU" "$BACKEND_MEMORY" "$BACKEND_MEMORY_RES" "$backend_env_vars" $BACKEND_C_PORT $BACKEND_H_PORT
deploy_service "ledbetter-website-frontend-service-3" $FRONTEND_FAMILY $FRONTEND_FAMILY "$FRONTEND_CPU" "$FRONTEND_MEMORY" "$FRONTEND_MEMORY_RES" "$frontend_env_vars" $FRONTEND_C_PORT $FRONTEND_H_PORT

echo "Deployment completed for both frontend and backend"

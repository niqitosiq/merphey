#!/bin/bash

# Ensure the script runs in its own directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

# Configuration
BRANCH=$(git rev-parse --abbrev-ref HEAD) # Auto-detect current branch
CONTAINER_NAME="bot"
INTERVAL=100

# Get the latest commit hash
LAST_COMMIT=$(git rev-parse HEAD)

while true; do
	                echo "Checking for updates in $SCRIPT_DIR on branch $BRANCH..."

			        # Fetch latest changes from remote
				        git fetch origin "$BRANCH"

					        # Get the latest commit hash from the remote
						        LATEST_COMMIT=$(git rev-parse origin/"$BRANCH")

							        # Check if a new commit exists
								        if [ "$LAST_COMMIT" != "$LATEST_COMMIT" ]; then
										        echo "New commit detected! Pulling changes..."

											        # Pull latest changes
												        git pull origin "$BRANCH"

													        # Restart the Docker container
														        echo "Restarting container $CONTAINER_NAME..."
															        docker compose down "$CONTAINER_NAME"
																        docker compose up -d "$CONTAINER_NAME" --build

																	        # Update last commit
																		        LAST_COMMIT=$LATEST_COMMIT
																			        else
																					        echo "No new commits. Checking again in $INTERVAL seconds..."
																						        fi

																							        # Wait before next check
																								        sleep "$INTERVAL"
																									        done


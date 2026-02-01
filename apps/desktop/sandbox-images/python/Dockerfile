# SmartSpec Sandbox - Python Image
# Full-featured Python development environment
#
# Includes: Python 3.11, pip, poetry, pipenv, common packages

FROM smartspec/sandbox-base:latest

LABEL maintainer="SmartSpec Team"
LABEL description="SmartSpec Sandbox Python Image"
LABEL version="1.0"

USER root

# Install Python 3.11
RUN add-apt-repository ppa:deadsnakes/ppa -y && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-venv \
    python3.11-dev \
    python3.11-distutils \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Set Python 3.11 as default
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1 && \
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1

# Upgrade pip
RUN python -m pip install --upgrade pip setuptools wheel

# Install uv (fast Python package installer)
RUN pip install uv

# Install Poetry
RUN curl -sSL https://install.python-poetry.org | python3 - && \
    ln -s /root/.local/bin/poetry /usr/local/bin/poetry

# Install pipenv
RUN pip install pipenv

# Install common Python packages
RUN pip install \
    # Web frameworks
    fastapi \
    uvicorn[standard] \
    flask \
    django \
    # HTTP clients
    requests \
    httpx \
    aiohttp \
    # Data processing
    pandas \
    numpy \
    polars \
    # Database
    sqlalchemy \
    alembic \
    asyncpg \
    pymysql \
    redis \
    # Testing
    pytest \
    pytest-asyncio \
    pytest-cov \
    # Code quality
    black \
    isort \
    flake8 \
    mypy \
    ruff \
    # Utilities
    python-dotenv \
    pydantic \
    pydantic-settings \
    typer \
    rich \
    # AI/ML basics
    openai \
    anthropic \
    langchain

# Switch back to sandbox user
USER sandbox

# Set Python environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PIP_NO_CACHE_DIR=1
ENV POETRY_VIRTUALENVS_IN_PROJECT=true

# Verify installations
RUN python --version && pip --version

# Default ports for Python apps
EXPOSE 8000 5000 8080

# Working directory
WORKDIR /workspace

# Default command
CMD ["tail", "-f", "/dev/null"]

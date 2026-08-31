FROM apache/airflow:3.3.1-python3.11

COPY airflow/requirements.txt /tmp/quickscout-airflow-requirements.txt

RUN pip install --no-cache-dir \
      "apache-airflow==3.3.1" \
      -r /tmp/quickscout-airflow-requirements.txt \
    && pip check

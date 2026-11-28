package br.com.grimorio.service;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.Path;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.S3Exception;

/**
 * O cofre no bucket S3 do Railway. As credenciais chegam pelas variaveis S3_ENDPOINT, S3_BUCKET, S3_KEY e
 * S3_SECRET, que o .railway/railway.ts liga ao bucket "midia".
 */
public class CofreS3 implements Cofre {

    private final S3Client s3;
    private final String bucket;

    public CofreS3(String endpoint, String bucket, String chave, String segredo, String regiao, boolean caminhoNoPath) {
        this.bucket = bucket;
        this.s3 = S3Client.builder()
                .endpointOverride(URI.create(endpoint))
                .region(Region.of(regiao == null || regiao.isBlank() ? "auto" : regiao))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(chave, segredo)))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(caminhoNoPath).build())
                .httpClient(UrlConnectionHttpClient.builder().build())
                .build();
    }

    private HeadObjectResponse cabecalho(String chave) throws IOException {
        try {
            return s3.headObject(b -> b.bucket(bucket).key(chave));
        } catch (NoSuchKeyException _) {
            return null;
        } catch (S3Exception e) {
            if (e.statusCode() == 404) return null;
            throw new IOException("bucket: " + e.getMessage(), e);
        } catch (SdkException e) {
            throw new IOException("bucket: " + e.getMessage(), e);
        }
    }

    @Override
    public boolean existe(String chave) throws IOException {
        return cabecalho(chave) != null;
    }

    @Override
    public long tamanho(String chave) throws IOException {
        HeadObjectResponse h = cabecalho(chave);
        return h == null ? -1 : h.contentLength();
    }

    @Override
    public void guardar(String chave, Path arquivo, boolean podeMover) throws IOException {
        try {
            s3.putObject(b -> b.bucket(bucket).key(chave), RequestBody.fromFile(arquivo));
        } catch (SdkException e) {
            throw new IOException("bucket: nao consegui guardar " + chave + ": " + e.getMessage(), e);
        }
    }

    @Override
    public InputStream abrir(String chave) throws IOException {
        try {
            return s3.getObject(b -> b.bucket(bucket).key(chave));
        } catch (NoSuchKeyException e) {
            throw new java.nio.file.NoSuchFileException(chave);
        } catch (SdkException e) {
            throw new IOException("bucket: " + e.getMessage(), e);
        }
    }

    @Override
    public InputStream abrir(String chave, long inicio, long fim) throws IOException {
        try {
            return s3.getObject(b -> b.bucket(bucket).key(chave).range("bytes=" + inicio + "-" + fim));
        } catch (NoSuchKeyException e) {
            throw new java.nio.file.NoSuchFileException(chave);
        } catch (SdkException e) {
            throw new IOException("bucket: " + e.getMessage(), e);
        }
    }

    @Override
    public void apagar(String chave) throws IOException {
        try {
            s3.deleteObject(b -> b.bucket(bucket).key(chave));
        } catch (SdkException e) {
            throw new IOException("bucket: nao consegui apagar " + chave + ": " + e.getMessage(), e);
        }
    }

    @Override
    public String descricao() {
        return "bucket " + bucket;
    }

    @Override
    public boolean remoto() {
        return true;
    }
}

package com.getcapacitor.myapp;

import static org.junit.Assert.*;
import java.nio.file.Files;
import java.nio.file.Paths;
import org.junit.Test;

/** 验证原生工程与 Capacitor 配置采用相同应用身份，不依赖设备。 */
public class ExampleUnitTest {
    @Test
    public void applicationIdentity_matchesCapacitor() throws Exception {
        String capacitor = Files.readString(Paths.get("../../capacitor.config.json"));
        String gradle = Files.readString(Paths.get("build.gradle"));
        assertTrue(capacitor.contains("\"appId\": \"com.aidiscussionnotes.app\""));
        assertTrue(gradle.contains("applicationId \"com.aidiscussionnotes.app\""));
    }
}
